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


authRouter.post('/register', asyncHandler(async (req, res) => {
  const body = registerSchema.parse(req.body);

  const passwordCheck = validatePassword(body.password);
  if (!passwordCheck.valid) {
    throw new AppError(400, passwordCheck.reason!, 'WEAK_PASSWORD');
  }

  const now = new Date();

  // Check if user exists
  const existing = await prisma.player.findFirst({
    where: {
      OR: [
        { email: body.email },
        { username: body.username },
      ],
    },
  });

  if (existing) {
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
  const player = await prisma.$transaction(async (tx) => {
    const created = await tx.player.create({
      data: {
        username: body.username,
        email: body.email,
        passwordHash,
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
    await ensureEquipmentSlots(created.id, tx);

    // Create starter off-hand item and equip it
    const starterOffHand = await tx.item.create({
      data: {
        ownerId: created.id,
        templateId: starterOffHandTemplate.id,
        rarity: 'common',
        quantity: 1,
        maxDurability: starterOffHandTemplate.maxDurability,
        currentDurability: starterOffHandTemplate.maxDurability,
      },
      select: { id: true },
    });
    await tx.playerEquipment.upsert({
      where: { playerId_slot: { playerId: created.id, slot: 'off_hand' } },
      create: { playerId: created.id, slot: 'off_hand', itemId: starterOffHand.id },
      update: { itemId: starterOffHand.id },
    });

    // Create initial zone discovery records
    await ensureStarterDiscoveries(created.id, tx);

    // Seed starter resource nodes and encounter site
    await ensureStarterEncounterAndNodes(created.id, tx);

    return created;
  });

  // Generate tokens
  const payload = { playerId: player.id, username: player.username, role: player.role };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  // Store refresh token
  await prisma.refreshToken.create({
    data: {
      playerId: player.id,
      token: refreshToken,
      expiresAt: refreshTokenExpiresAt(now.getTime()),
    },
  });

  res.status(201).json({
    player: {
      id: player.id,
      username: player.username,
      email: player.email,
      role: player.role,
      emailVerified: false,
    },
    accessToken,
    refreshToken,
  });

  // Fire-and-forget: don't block registration on email send
  createEmailVerificationToken(player.id)
    .then(({ rawToken }) => sendVerificationEmail(player.email, rawToken, player.username))
    .catch((err) => console.error('Failed to send verification email:', err));
}));

authRouter.post('/login', loginLimiter, asyncHandler(async (req, res) => {
  const body = loginSchema.parse(req.body);
  const now = new Date();

  const player = await prisma.player.findUnique({
    where: { email: body.email },
    select: { id: true, username: true, email: true, role: true, passwordHash: true, isBot: true, emailVerified: true },
  });

  if (!player) {
    throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
  }

  if (player.isBot) {
    throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
  }

  const locked = await isLockedOut(player.id);

  const validPassword = await bcrypt.compare(body.password, player.passwordHash);
  if (!validPassword) {
    await recordFailedLogin(player.id);
    throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
  }

  if (locked) {
    throw new AppError(423, 'Account temporarily locked, try again later', 'ACCOUNT_LOCKED');
  }

  await clearLockout(player.id);

  // Update last active
  await prisma.player.update({
    where: { id: player.id },
    data: { lastActiveAt: now },
  });

  // Generate tokens
  const payload = { playerId: player.id, username: player.username, role: player.role };
  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  // Store refresh token
  await prisma.refreshToken.create({
    data: {
      playerId: player.id,
      token: refreshToken,
      expiresAt: refreshTokenExpiresAt(now.getTime()),
    },
  });

  res.json({
    player: {
      id: player.id,
      username: player.username,
      email: player.email,
      role: player.role,
      emailVerified: player.emailVerified,
    },
    accessToken,
    refreshToken,
  });
}));

authRouter.post('/refresh', asyncHandler(async (req, res) => {
  const { refreshToken } = refreshSchema.parse(req.body);
  const now = new Date();

  // Verify token
  const payload = verifyRefreshToken(refreshToken);

  // Require token to exist in DB and not be expired (no activity-window bypass)
  const [storedToken, player] = await Promise.all([
    prisma.refreshToken.findUnique({
      where: { token: refreshToken },
    }),
    prisma.player.findUnique({
      where: { id: payload.playerId },
      select: { id: true, role: true },
    }),
  ]);

  if (!player) {
    throw new AppError(401, 'Invalid or expired refresh token', 'INVALID_TOKEN');
  }

  if (!storedToken || storedToken.expiresAt < now) {
    throw new AppError(401, 'Invalid or expired refresh token', 'INVALID_TOKEN');
  }

  // Best-effort delete to avoid race failures under concurrent refresh requests.
  await prisma.refreshToken.deleteMany({
    where: { token: refreshToken },
  });

  // Generate new tokens with fresh role from DB
  const freshPayload = { ...payload, role: player.role ?? 'player' };
  const newAccessToken = generateAccessToken(freshPayload);
  const newRefreshToken = generateRefreshToken(freshPayload);

  // Store new refresh token and keep activity timestamp fresh.
  await prisma.$transaction([
    prisma.refreshToken.create({
      data: {
        playerId: payload.playerId,
        token: newRefreshToken,
        expiresAt: refreshTokenExpiresAt(now.getTime()),
      },
    }),
    prisma.player.update({
      where: { id: payload.playerId },
      data: { lastActiveAt: now },
    }),
  ]);

  res.json({
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
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
  const playerId = req.player!.playerId;

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { email: true, username: true, emailVerified: true },
  });

  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  if (player.emailVerified) {
    throw new AppError(400, 'Email is already verified', 'ALREADY_VERIFIED');
  }

  const { rawToken } = await createEmailVerificationToken(playerId);
  await sendVerificationEmail(player.email, rawToken, player.username);

  res.json({ message: 'Verification email sent' });
}));

authRouter.post('/forgot-password', forgotPasswordLimiter, asyncHandler(async (req, res) => {
  const { email } = forgotPasswordSchema.parse(req.body);

  // Always return the same response immediately to prevent timing leaks
  res.json({ message: 'If that email is verified with us, we\'ve sent a reset link.' });

  // Process asynchronously after response is sent
  const player = await prisma.player.findUnique({
    where: { email },
    select: { id: true, username: true, emailVerified: true },
  });

  if (player?.emailVerified) {
    const allowed = await checkEmailRateLimit(email);
    if (allowed) {
      const { rawToken } = await createPasswordResetToken(player.id);
      sendPasswordResetEmail(email, rawToken, player.username).catch((err) =>
        console.error('Failed to send password reset email:', err),
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

  await prisma.$transaction([
    prisma.player.update({
      where: { id: tokenRecord.playerId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: tokenRecord.id },
      data: { usedAt: new Date() },
    }),
    prisma.refreshToken.deleteMany({
      where: { playerId: tokenRecord.playerId },
    }),
  ]);

  res.json({ message: 'Password reset successfully. Please log in with your new password.' });
}));

authRouter.post('/change-email', authenticate, asyncHandler(async (req, res) => {
  const body = changeEmailSchema.parse(req.body);
  await changePlayerEmail(req.player!.playerId, body.email, body.password);
  res.json({ message: 'Email updated. Check your inbox to verify your new address.' });
}));

authRouter.post('/change-password', authenticate, asyncHandler(async (req, res) => {
  const body = changePasswordSchema.parse(req.body);
  const passwordCheck = validatePassword(body.newPassword);
  if (!passwordCheck.valid) {
    throw new AppError(400, passwordCheck.reason!, 'WEAK_PASSWORD');
  }
  await changePlayerPassword(req.player!.playerId, body.currentPassword, body.newPassword);
  res.json({ message: 'Password updated. Please log in again.' });
}));
