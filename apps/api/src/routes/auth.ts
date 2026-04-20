import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { prisma } from '@pocketrealm/database';
import { TURN_CONSTANTS, CHARACTER_CONSTANTS, ALL_SKILLS, STARTER_LOADOUT, RATE_LIMIT_CONSTANTS, AUTH_CONSTANTS } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import { createEndpointLimiter } from '../middleware/rateLimiter';
import {
  generateAccessToken,
  generateRefreshToken,
  refreshTokenExpiresAt,
  verifyRefreshToken,
  authenticate,
} from '../middleware/auth';
import { ensureEquipmentSlots } from '../services/equipmentService';
import { ensureStarterDiscoveries, ensureStarterEncounterAndNodes } from '../services/zoneDiscoveryService';
import { asyncHandler } from '../utils/asyncHandler';
import { validatePassword } from '../utils/passwordValidation';
import { createEmailVerificationToken, verifyEmailToken, createPasswordResetToken, verifyPasswordResetToken } from '../services/authTokenService';
import { sendVerificationEmail, sendPasswordResetEmail } from '../services/emailService';
import { recordFailedLogin, isLockedOut, clearLockout, checkEmailRateLimit } from '../services/lockoutService';
import { verifyPlayerEmail, changePlayerEmail, changePlayerPassword } from '../services/authService';
import { checkAndSpawnEvents } from '../services/eventSchedulerService';
import { logger } from '../logger';
import { getIo } from '../socket';


// Strict rate limiter for login: 10 attempts per 15 minutes per IP
const loginLimiter = createEndpointLimiter('login', RATE_LIMIT_CONSTANTS.LOGIN_WINDOW_MS, RATE_LIMIT_CONSTANTS.LOGIN_MAX, { message: 'Too many login attempts, please try again later' });

export const authRouter = Router();

const registerSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  password: z.string().min(10).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

const verifyEmailSchema = z.object({ token: z.string().min(1) });

const resendVerificationLimiter = createEndpointLimiter('resend-verification', RATE_LIMIT_CONSTANTS.RESEND_VERIFICATION_WINDOW_MS, RATE_LIMIT_CONSTANTS.RESEND_VERIFICATION_MAX, { message: 'Too many verification requests, please try again later' });

const forgotPasswordSchema = z.object({ email: z.string().email() });
const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(10).max(100),
});

const forgotPasswordLimiter = createEndpointLimiter('forgot-password', RATE_LIMIT_CONSTANTS.FORGOT_PASSWORD_WINDOW_MS, RATE_LIMIT_CONSTANTS.FORGOT_PASSWORD_MAX, { message: 'Too many password reset requests, please try again later' });

const changeEmailSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(10).max(100),
});

const switchPlayerSchema = z.object({
  playerId: z.string().uuid().or(z.string().min(1)),
});

const joinSeasonSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
});

interface CharacterSummary {
  id: string;
  username: string;
  characterLevel: number;
  seasonId: string | null;
  seasonName: string | null;
  seasonStatus: string | null;
  seasonEndsAt: Date | null;
}

authRouter.post('/register', asyncHandler(async (req, res) => {
  const body = registerSchema.parse(req.body);

  const passwordCheck = validatePassword(body.password);
  if (!passwordCheck.valid) {
    throw new AppError(400, passwordCheck.reason!, 'WEAK_PASSWORD');
  }

  const now = new Date();

  // Check if user exists
  const [existingAccount, existingPlayer] = await Promise.all([
    prisma.account.findUnique({ where: { email: body.email }, select: { id: true } }),
    prisma.player.findUnique({ where: { username: body.username }, select: { id: true } }),
  ]);

  if (existingAccount || existingPlayer) {
    throw new AppError(409, 'Username or email already taken', 'USER_EXISTS');
  }

  // Hash password
  const passwordHash = await bcrypt.hash(body.password, AUTH_CONSTANTS.BCRYPT_ROUNDS);

  // Find starter town (for homeTownId) and first connected wild zone (for currentZoneId)
  const starterTown = await prisma.zone.findFirst({ where: { isStarter: true } });
  if (!starterTown) throw new AppError(500, 'No starter zone configured', 'NO_STARTER_ZONE');

  const firstWildConnection = await prisma.zoneConnection.findFirst({
    where: { fromId: starterTown.id, toZone: { zoneType: 'wild' } },
    include: { toZone: true },
  });
  const startingZone = firstWildConnection?.toZone ?? starterTown;
  const starterOffHandTemplate = await prisma.itemTemplate.findUnique({
    where: { id: STARTER_LOADOUT.tutorialOffHandTemplateId },
    select: { id: true, maxDurability: true },
  });
  if (!starterOffHandTemplate) {
    throw new AppError(500, 'Starter off-hand template is missing', 'MISSING_STARTER_ITEM');
  }

  // Create player with all related records in a single transaction for atomicity.
  // If any step fails, the entire registration is rolled back so retries won't
  // hit USER_EXISTS (409) for an incomplete player.
  const registration = await prisma.$transaction(async (tx) => {
    const account = await tx.account.create({
      data: {
        email: body.email,
        passwordHash,
        role: 'player',
        lastActiveAt: now,
      },
    });

    const player = await tx.player.create({
      data: {
        accountId: account.id,
        username: body.username,
        lastActiveAt: now,
        currentZoneId: startingZone.id,
        lastTravelledFromZoneId: starterTown.id,
        homeTownId: starterTown.id,
        attributePoints: CHARACTER_CONSTANTS.STARTING_ATTRIBUTE_POINTS,
        turnBank: {
          create: {
            currentTurns: TURN_CONSTANTS.STARTING_TURNS,
          },
        },
        skills: {
          create: ALL_SKILLS.map((skill: string) => ({
            skillType: skill,
            level: 1,
            xp: BigInt(0),
          })),
        },
      },
      include: {
        turnBank: true,
        skills: true,
      },
    });

    // Ensure equipment slots
    await ensureEquipmentSlots(player.id, tx);

    // Create starter off-hand item and equip it
    const starterOffHand = await tx.item.create({
      data: {
        ownerId: player.id,
        templateId: starterOffHandTemplate.id,
        rarity: 'common',
        quantity: 1,
        maxDurability: starterOffHandTemplate.maxDurability,
        currentDurability: starterOffHandTemplate.maxDurability,
      },
      select: { id: true },
    });
    await tx.playerEquipment.upsert({
      where: { playerId_slot: { playerId: player.id, slot: 'off_hand' } },
      create: { playerId: player.id, slot: 'off_hand', itemId: starterOffHand.id },
      update: { itemId: starterOffHand.id },
    });

    // Create initial zone discovery records
    await ensureStarterDiscoveries(player.id, tx);

    // Seed starter resource nodes and encounter site
    await ensureStarterEncounterAndNodes(player.id, tx);

    await tx.account.update({
      where: { id: account.id },
      data: { activePlayerId: player.id },
    });

    return {
      account,
      player,
    };
  });

  // Generate tokens
  const payload = {
    accountId: registration.account.id,
    playerId: registration.player.id,
    username: registration.player.username,
    seasonId: registration.player.seasonId,
    role: registration.account.role,
  };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  // Store refresh token and opportunistically clear expired sessions.
  await prisma.$transaction([
    prisma.refreshToken.deleteMany({
      where: {
        accountId: registration.account.id,
        expiresAt: { lt: now },
      },
    }),
    prisma.refreshToken.create({
      data: {
        accountId: registration.account.id,
        token: refreshToken,
        expiresAt: refreshTokenExpiresAt(now.getTime()),
      },
    }),
  ]);

  logger.info({ playerId: registration.player.id, username: registration.player.username }, 'Player registered');

  res.status(201).json({
    player: {
      id: registration.player.id,
      username: registration.player.username,
      email: registration.account.email,
      role: registration.account.role,
      emailVerified: false,
      seasonId: registration.player.seasonId,
      isPremium: registration.account.isPremium,
      premiumExpiresAt: registration.account.premiumExpiresAt,
    },
    accessToken,
    refreshToken,
  });

  // Fire-and-forget: don't block registration on email send
  createEmailVerificationToken(registration.account.id)
    .then(({ rawToken }) => sendVerificationEmail(registration.account.email, rawToken, registration.player.username))
    .catch((err) => logger.error({ err }, 'Failed to send verification email'));
}));

authRouter.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const body = loginSchema.parse(req.body);
  const now = new Date();

  const account = await prisma.account.findUnique({
    where: { email: body.email },
    select: {
      id: true,
      email: true,
      role: true,
      passwordHash: true,
      emailVerified: true,
      isPremium: true,
      premiumExpiresAt: true,
      activePlayer: {
        select: {
          id: true,
          username: true,
          seasonId: true,
          isBot: true,
        },
      },
    },
  });

  if (!account?.activePlayer) {
    throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
  }

  if (account.activePlayer.isBot) {
    throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
  }
  const activePlayer = account.activePlayer;

  const locked = await isLockedOut(account.id);

  const validPassword = await bcrypt.compare(body.password, account.passwordHash);
  if (!validPassword) {
    await recordFailedLogin(account.id);
    throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
  }

  if (locked) {
    throw new AppError(423, 'Account temporarily locked, try again later', 'ACCOUNT_LOCKED');
  }

  await clearLockout(account.id);

  // Update last active
  await prisma.account.update({
    where: { id: account.id },
    data: { lastActiveAt: now },
  });

  // Generate tokens
  const payload = {
    accountId: account.id,
    playerId: activePlayer.id,
    username: activePlayer.username,
    seasonId: activePlayer.seasonId,
    role: account.role,
  };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  // Store refresh token and opportunistically clear expired sessions.
  await prisma.$transaction([
    prisma.refreshToken.deleteMany({
      where: {
        accountId: account.id,
        expiresAt: { lt: now },
      },
    }),
    prisma.refreshToken.create({
      data: {
        accountId: account.id,
        token: refreshToken,
        expiresAt: refreshTokenExpiresAt(now.getTime()),
      },
    }),
  ]);

  logger.info({ playerId: activePlayer.id, username: activePlayer.username }, 'Player logged in');

  res.json({
    player: {
      id: account.activePlayer.id,
      username: activePlayer.username,
      email: account.email,
      role: account.role,
      emailVerified: account.emailVerified,
      seasonId: activePlayer.seasonId,
      isPremium: account.isPremium,
      premiumExpiresAt: account.premiumExpiresAt,
    },
    accessToken,
    refreshToken,
  });

  void checkAndSpawnEvents(getIo()).catch((err) => {
    logger.warn({ err, playerId: activePlayer.id }, 'Post-login world event catch-up failed');
  });
}));

authRouter.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = refreshSchema.parse(req.body);
  const now = new Date();

  // Verify token
  const payload = verifyRefreshToken(refreshToken);

  // Require token to exist in DB and not be expired (no activity-window bypass)
  const [storedToken, account] = await Promise.all([
    prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    }),
    prisma.account.findUnique({
      where: { id: payload.accountId },
      select: {
        id: true,
        role: true,
        activePlayer: {
          select: {
            id: true,
            username: true,
            seasonId: true,
          },
        },
      },
    }),
  ]);

  if (!account?.activePlayer) {
    throw new AppError(401, 'Invalid or expired refresh token', 'INVALID_TOKEN');
  }

  if (!storedToken || storedToken.accountId !== payload.accountId || storedToken.expiresAt < now) {
    throw new AppError(401, 'Invalid or expired refresh token', 'INVALID_TOKEN');
  }

  // Best-effort delete to avoid race failures under concurrent refresh requests.
  await prisma.refreshToken.deleteMany({
    where: { token: refreshToken },
  });

  // Generate new tokens with fresh role from DB
  const freshPayload = {
    accountId: account.id,
    playerId: account.activePlayer.id,
    username: account.activePlayer.username,
    seasonId: account.activePlayer.seasonId,
    role: account.role ?? 'player',
  };
  const newAccessToken = generateAccessToken(freshPayload);
  const newRefreshToken = generateRefreshToken(freshPayload);

  // Store new refresh token and keep activity timestamp fresh.
  await prisma.$transaction([
    prisma.refreshToken.deleteMany({
      where: {
        accountId: payload.accountId,
        expiresAt: { lt: now },
      },
    }),
    prisma.refreshToken.create({
      data: {
        accountId: payload.accountId,
        token: newRefreshToken,
        expiresAt: refreshTokenExpiresAt(now.getTime()),
      },
    }),
    prisma.account.update({
      where: { id: payload.accountId },
      data: { lastActiveAt: now },
    }),
  ]);

  res.json({
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  });

  void checkAndSpawnEvents(getIo()).catch((err) => {
    logger.warn({ err, playerId: freshPayload.playerId }, 'Post-refresh world event catch-up failed');
  });
}));

authRouter.get('/characters', authenticate, asyncHandler(async (req, res) => {
  const players = await prisma.player.findMany({
    where: {
      accountId: req.player!.accountId,
      isBot: false,
    },
    select: {
      id: true,
      username: true,
      characterLevel: true,
      seasonId: true,
      season: {
        select: {
          name: true,
          status: true,
          endsAt: true,
        },
      },
    },
    orderBy: [
      { seasonId: 'asc' },
      { createdAt: 'asc' },
    ],
  });

  const characters: CharacterSummary[] = players.map((player) => ({
    id: player.id,
    username: player.username,
    characterLevel: player.characterLevel,
    seasonId: player.seasonId,
    seasonName: player.season?.name ?? null,
    seasonStatus: player.season?.status ?? null,
    seasonEndsAt: player.season?.endsAt ?? null,
  }));

  res.json({
    characters,
    activePlayerId: req.player!.playerId,
  });
}));

authRouter.get('/season-archives', authenticate, asyncHandler(async (req, res) => {
  const archives = await prisma.seasonArchive.findMany({
    where: { accountId: req.player!.accountId },
    select: {
      id: true,
      username: true,
      characterLevel: true,
      characterXp: true,
      attributes: true,
      skills: true,
      stats: true,
      combatTemplates: true,
      leaderboardRanks: true,
      rewardsEarned: true,
      mergeLog: true,
      createdAt: true,
      season: {
        select: {
          id: true,
          name: true,
          startsAt: true,
          endsAt: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    archives: archives.map((archive) => ({
      id: archive.id,
      username: archive.username,
      characterLevel: archive.characterLevel,
      characterXp: Number(archive.characterXp),
      attributes: archive.attributes,
      skills: archive.skills,
      stats: archive.stats,
      combatTemplates: archive.combatTemplates,
      leaderboardRanks: archive.leaderboardRanks,
      rewardsEarned: archive.rewardsEarned,
      mergeLog: archive.mergeLog,
      createdAt: archive.createdAt,
      season: archive.season,
    })),
  });
}));

authRouter.post('/switch-player', authenticate, asyncHandler(async (req, res) => {
  const { playerId } = switchPlayerSchema.parse(req.body);

  const player = await prisma.player.findFirst({
    where: {
      id: playerId,
      accountId: req.player!.accountId,
      isBot: false,
    },
    select: {
      id: true,
      username: true,
      seasonId: true,
      season: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  if (!player) {
    throw new AppError(404, 'Character not found', 'NOT_FOUND');
  }

  if (player.season && player.season.status !== 'active') {
    throw new AppError(400, 'This seasonal character is no longer playable', 'SEASON_CHARACTER_UNPLAYABLE');
  }

  await prisma.account.update({
    where: { id: req.player!.accountId },
    data: { activePlayerId: player.id },
  });

  const account = await prisma.account.findUnique({
    where: { id: req.player!.accountId },
    select: {
      id: true,
      role: true,
    },
  });

  if (!account) {
    throw new AppError(404, 'Account not found', 'NOT_FOUND');
  }

  const payload = {
    accountId: req.player!.accountId,
    playerId: player.id,
    username: player.username,
    seasonId: player.seasonId,
    role: account.role,
  };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await prisma.refreshToken.create({
    data: {
      accountId: req.player!.accountId,
      token: refreshToken,
      expiresAt: refreshTokenExpiresAt(Date.now()),
    },
  });

  res.json({
    player: {
      id: player.id,
      username: player.username,
    },
    accessToken,
    refreshToken,
  });
}));

authRouter.post('/join-season', authenticate, asyncHandler(async (req, res) => {
  const { username } = joinSeasonSchema.parse(req.body);
  const now = new Date();

  const activeSeason = await prisma.season.findFirst({
    where: { status: 'active' },
    select: {
      id: true,
      name: true,
    },
  });

  if (!activeSeason) {
    throw new AppError(400, 'No active season', 'NO_ACTIVE_SEASON');
  }

  const existingCharacter = await prisma.player.findFirst({
    where: {
      accountId: req.player!.accountId,
      seasonId: activeSeason.id,
    },
    select: { id: true },
  });

  if (existingCharacter) {
    throw new AppError(409, 'Already have a character for this season', 'SEASON_CHARACTER_EXISTS');
  }

  const usernameTaken = await prisma.player.findUnique({
    where: { username },
    select: { id: true },
  });

  if (usernameTaken) {
    throw new AppError(409, 'Username already taken', 'USERNAME_TAKEN');
  }

  const starterTown = await prisma.zone.findFirst({
    where: {
      isStarter: true,
      seasonId: activeSeason.id,
    },
    select: {
      id: true,
    },
  }) ?? await prisma.zone.findFirst({
    where: {
      isStarter: true,
      seasonId: null,
    },
    select: {
      id: true,
    },
  });

  if (!starterTown) {
    throw new AppError(500, 'No starter zone configured', 'NO_STARTER_ZONE');
  }

  const firstWildConnection = await prisma.zoneConnection.findFirst({
    where: { fromId: starterTown.id, toZone: { zoneType: 'wild' } },
    include: { toZone: true },
  });
  const startingZone = firstWildConnection?.toZone ?? starterTown;

  const starterOffHandTemplate = await prisma.itemTemplate.findUnique({
    where: { id: STARTER_LOADOUT.tutorialOffHandTemplateId },
    select: { id: true, maxDurability: true },
  });
  if (!starterOffHandTemplate) {
    throw new AppError(500, 'Starter off-hand template is missing', 'MISSING_STARTER_ITEM');
  }

  const player = await prisma.$transaction(async (tx) => {
    const createdPlayer = await tx.player.create({
      data: {
        username,
        accountId: req.player!.accountId,
        seasonId: activeSeason.id,
        lastActiveAt: now,
        currentZoneId: startingZone.id,
        lastTravelledFromZoneId: starterTown.id,
        homeTownId: starterTown.id,
        attributePoints: CHARACTER_CONSTANTS.STARTING_ATTRIBUTE_POINTS,
        turnBank: {
          create: {
            currentTurns: TURN_CONSTANTS.STARTING_TURNS,
          },
        },
        skills: {
          create: ALL_SKILLS.map((skill: string) => ({
            skillType: skill,
            level: 1,
            xp: BigInt(0),
          })),
        },
      },
      select: {
        id: true,
        username: true,
        seasonId: true,
      },
    });

    await ensureEquipmentSlots(createdPlayer.id, tx);

    const starterOffHand = await tx.item.create({
      data: {
        ownerId: createdPlayer.id,
        templateId: starterOffHandTemplate.id,
        rarity: 'common',
        quantity: 1,
        maxDurability: starterOffHandTemplate.maxDurability,
        currentDurability: starterOffHandTemplate.maxDurability,
      },
      select: { id: true },
    });
    await tx.playerEquipment.upsert({
      where: { playerId_slot: { playerId: createdPlayer.id, slot: 'off_hand' } },
      create: { playerId: createdPlayer.id, slot: 'off_hand', itemId: starterOffHand.id },
      update: { itemId: starterOffHand.id },
    });

    await ensureStarterDiscoveries(createdPlayer.id, tx);
    await ensureStarterEncounterAndNodes(createdPlayer.id, tx);

    return createdPlayer;
  });

  await prisma.account.update({
    where: { id: req.player!.accountId },
    data: { activePlayerId: player.id },
  });

  const account = await prisma.account.findUnique({
    where: { id: req.player!.accountId },
    select: {
      id: true,
      role: true,
    },
  });

  if (!account) {
    throw new AppError(404, 'Account not found', 'NOT_FOUND');
  }

  const payload = {
    accountId: req.player!.accountId,
    playerId: player.id,
    username: player.username,
    seasonId: player.seasonId,
    role: account.role,
  };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await prisma.refreshToken.create({
    data: {
      accountId: req.player!.accountId,
      token: refreshToken,
      expiresAt: refreshTokenExpiresAt(Date.now()),
    },
  });

  res.status(201).json({
    player: {
      id: player.id,
      username: player.username,
    },
    seasonId: activeSeason.id,
    accessToken,
    refreshToken,
  });
}));

authRouter.post('/logout', asyncHandler(async (req, res) => {
  const parsed = refreshSchema.safeParse(req.body);

  if (parsed.success) {
    await prisma.refreshToken.deleteMany({
      where: { token: parsed.data.refreshToken },
    });
  }

  res.json({ success: true });
}));


authRouter.post('/verify-email', asyncHandler(async (req, res) => {
  const { token } = verifyEmailSchema.parse(req.body);

  const tokenRecord = await verifyEmailToken(token);
  if (!tokenRecord) {
    throw new AppError(400, 'Invalid or expired verification token', 'INVALID_TOKEN');
  }

  const trialGranted = await verifyPlayerEmail(tokenRecord);

  res.json({
    message: trialGranted
      ? 'Email verified! You\'ve been awarded 3 days of Champion.'
      : 'Email verified!',
    championTrialGranted: trialGranted,
  });
}));

authRouter.post('/resend-verification', authenticate, resendVerificationLimiter, asyncHandler(async (req, res) => {
  const accountId = req.player!.accountId;

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      email: true,
      emailVerified: true,
      activePlayer: { select: { username: true } },
    },
  });

  if (!account) {
    throw new AppError(404, 'Account not found', 'NOT_FOUND');
  }

  if (account.emailVerified) {
    throw new AppError(400, 'Email is already verified', 'ALREADY_VERIFIED');
  }

  const { rawToken } = await createEmailVerificationToken(accountId);
  await sendVerificationEmail(account.email, rawToken, account.activePlayer?.username ?? 'Adventurer');

  res.json({ message: 'Verification email sent' });
}));

authRouter.post('/forgot-password', forgotPasswordLimiter, asyncHandler(async (req, res) => {
  const { email } = forgotPasswordSchema.parse(req.body);

  // Always return the same response immediately to prevent timing leaks
  res.json({ message: 'If that email is verified with us, we\'ve sent a reset link.' });

  // Process asynchronously after response is sent
  const account = await prisma.account.findUnique({
    where: { email },
    select: {
      id: true,
      emailVerified: true,
      activePlayer: { select: { username: true } },
    },
  });

  if (account?.emailVerified) {
    const allowed = await checkEmailRateLimit(email);
    if (allowed) {
      const { rawToken } = await createPasswordResetToken(account.id);
      sendPasswordResetEmail(email, rawToken, account.activePlayer?.username ?? 'Adventurer').catch((err) =>
        logger.error({ err }, 'Failed to send password reset email'),
      );
    }
  }
}));

authRouter.post('/reset-password', asyncHandler(async (req, res) => {
  const body = resetPasswordSchema.parse(req.body);

  const passwordCheck = validatePassword(body.password);
  if (!passwordCheck.valid) {
    throw new AppError(400, passwordCheck.reason!, 'WEAK_PASSWORD');
  }

  const tokenRecord = await verifyPasswordResetToken(body.token);
  if (!tokenRecord) {
    throw new AppError(400, 'Invalid or expired reset token', 'INVALID_TOKEN');
  }

  const passwordHash = await bcrypt.hash(body.password, AUTH_CONSTANTS.BCRYPT_ROUNDS);

  // Atomically consume token + update password to prevent concurrent reuse.
  // The conditional update on usedAt:null ensures only one request succeeds.
  await prisma.$transaction(async (tx) => {
    const consumed = await tx.passwordResetToken.updateMany({
      where: { id: tokenRecord.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    if (consumed.count === 0) {
      throw new AppError(400, 'Invalid or expired reset token', 'INVALID_TOKEN');
    }

    await tx.account.update({
      where: { id: tokenRecord.accountId },
      data: { passwordHash },
    });

    await tx.refreshToken.deleteMany({
      where: { accountId: tokenRecord.accountId },
    });
  });

  res.json({ message: 'Password reset successfully. Please log in with your new password.' });
}));

authRouter.post('/change-email', authenticate, asyncHandler(async (req, res) => {
  const body = changeEmailSchema.parse(req.body);
  await changePlayerEmail(req.player!.accountId, body.email, body.password);
  res.json({ message: 'Email updated. Check your inbox to verify your new address.' });
}));

authRouter.post('/change-password', authenticate, asyncHandler(async (req, res) => {
  const body = changePasswordSchema.parse(req.body);
  const passwordCheck = validatePassword(body.newPassword);
  if (!passwordCheck.valid) {
    throw new AppError(400, passwordCheck.reason!, 'WEAK_PASSWORD');
  }
  await changePlayerPassword(req.player!.accountId, body.currentPassword, body.newPassword);
  res.json({ message: 'Password updated. Please log in again.' });
}));
