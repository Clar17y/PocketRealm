import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import { prisma } from '@adventure/database';
import { TURN_CONSTANTS, SkillType } from '@adventure/shared';
import { AppError } from '../middleware/errorHandler';
import {
  generateAccessToken,
  generateRefreshToken,
  refreshTokenExpiresAt,
  sessionInactivityCutoff,
  verifyRefreshToken,
} from '../middleware/auth';
import { ensureStarterDiscoveries, ensureStarterEncounterAndNodes } from '../services/zoneDiscoveryService';

export const authRouter = Router();

const registerSchema = z.object({
  username: z.string().min(3).max(32).regex(/^[a-zA-Z0-9_]+$/),
  email: z.string().email(),
  password: z.string().min(8).max(100),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const ALL_SKILLS: SkillType[] = [
  'melee', 'ranged', 'magic',
  'mining', 'foraging', 'woodcutting',
  'refining', 'tanning', 'weaving',
  'weaponsmithing', 'armorsmithing', 'leatherworking', 'tailoring', 'alchemy',
];

function isRecentlyActive(lastActiveAt: Date | null, nowMs = Date.now()): boolean {
  if (!lastActiveAt) return false;
  return lastActiveAt >= sessionInactivityCutoff(nowMs);
}

authRouter.post('/register', async (req, res, next) => {
  try {
    const body = registerSchema.parse(req.body);
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
    const passwordHash = await bcrypt.hash(body.password, 10);

    // Find starter town (for homeTownId) and first connected wild zone (for currentZoneId)
    const starterTown = await prisma.zone.findFirst({ where: { isStarter: true } });
    if (!starterTown) throw new AppError(500, 'No starter zone configured', 'NO_STARTER_ZONE');

    const firstWildConnection = await prisma.zoneConnection.findFirst({
      where: { fromId: starterTown.id, toZone: { zoneType: 'wild' } },
      include: { toZone: true },
    });
    const startingZone = firstWildConnection?.toZone ?? starterTown;

    // Create player with all related records
    const player = await prisma.player.create({
      data: {
        username: body.username,
        email: body.email,
        passwordHash,
        lastActiveAt: now,
        currentZoneId: startingZone.id,
        homeTownId: starterTown.id,
        turnBank: {
          create: {
            currentTurns: TURN_CONSTANTS.STARTING_TURNS,
          },
        },
        skills: {
          create: ALL_SKILLS.map(skill => ({
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

    // Create initial zone discovery records
    await ensureStarterDiscoveries(player.id);

    // Seed starter resource nodes and encounter site
    await ensureStarterEncounterAndNodes(player.id);

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
      },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const body = loginSchema.parse(req.body);
    const now = new Date();

    const player = await prisma.player.findUnique({
      where: { email: body.email },
    });

    if (!player) {
      throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }

    if (player.isBot) {
      throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }

    const validPassword = await bcrypt.compare(body.password, player.passwordHash);
    if (!validPassword) {
      throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
    }

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
      },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    next(err);
  }
});

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const now = new Date();

    if (!refreshToken) {
      throw new AppError(400, 'Refresh token required', 'MISSING_TOKEN');
    }

    // Verify token
    const payload = verifyRefreshToken(refreshToken);

    // Check if token exists in DB and player has remained recently active.
    const [storedToken, player] = await Promise.all([
      prisma.refreshToken.findUnique({
        where: { token: refreshToken },
      }),
      prisma.player.findUnique({
        where: { id: payload.playerId },
        select: { id: true, lastActiveAt: true, role: true },
      }),
    ]);

    if (!player) {
      throw new AppError(401, 'Invalid or expired refresh token', 'INVALID_TOKEN');
    }

    const storedTokenValid = Boolean(storedToken && storedToken.expiresAt >= now);
    const activeWithinWindow = isRecentlyActive(player.lastActiveAt, now.getTime());

    if (!storedTokenValid && !activeWithinWindow) {
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
  } catch (err) {
    next(err);
  }
});

authRouter.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (refreshToken) {
      await prisma.refreshToken.deleteMany({
        where: { token: refreshToken },
      });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});
