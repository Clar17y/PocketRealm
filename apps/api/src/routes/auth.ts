import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import rateLimit from 'express-rate-limit';
import { prisma } from '@pocketrealm/database';
import { TURN_CONSTANTS, CHARACTER_CONSTANTS, ALL_SKILLS, ALL_EQUIPMENT_SLOTS, STARTER_LOADOUT } from '@pocketrealm/shared';
import { AppError } from '../middleware/errorHandler';
import {
  generateAccessToken,
  generateRefreshToken,
  refreshTokenExpiresAt,
  verifyRefreshToken,
} from '../middleware/auth';
// ensureEquipmentSlots, ensureStarterDiscoveries, ensureStarterEncounterAndNodes
// are inlined within the registration transaction for atomicity.
import { asyncHandler } from '../utils/asyncHandler';

// Strict rate limiter for login: 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again later', code: 'RATE_LIMITED' },
});

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

const refreshSchema = z.object({ refreshToken: z.string().min(1) });


authRouter.post('/register', asyncHandler(async (req, res) => {
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
    const existingSlots = await tx.playerEquipment.findMany({
      where: { playerId: created.id },
      select: { slot: true },
    });
    const existingSlotSet = new Set(existingSlots.map((e: { slot: string }) => e.slot));
    const missingSlots = ALL_EQUIPMENT_SLOTS.filter((slot: string) => !existingSlotSet.has(slot));
    if (missingSlots.length > 0) {
      await tx.playerEquipment.createMany({
        data: missingSlots.map((slot: string) => ({ playerId: created.id, slot, itemId: null })),
      });
    }

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
    const starterZones = await tx.zone.findMany({ where: { isStarter: true }, select: { id: true }, orderBy: { id: 'asc' } });
    if (starterZones.length > 0) {
      const starterIds: string[] = starterZones.map((z: { id: string }) => z.id);
      const connections = await tx.zoneConnection.findMany({
        where: { fromId: { in: starterIds } },
        select: { toId: true },
      });
      const connectedIds: string[] = connections.map((c: { toId: string }) => c.toId);
      const allDiscoveryZoneIds = [...new Set([...starterIds, ...connectedIds])];
      await tx.playerZoneDiscovery.createMany({
        data: allDiscoveryZoneIds.map((zoneId: string) => ({ playerId: created.id, zoneId })),
        skipDuplicates: true,
      });
    }

    // Seed starter resource nodes and encounter site (reuse starterZones from above)
    const starterTownForNodes = starterZones[0];
    if (starterTownForNodes) {
      const nodeConnections = await tx.zoneConnection.findMany({
        where: { fromId: starterTownForNodes.id },
        select: { toId: true },
      });
      if (nodeConnections.length > 0) {
        const wildZone = await tx.zone.findFirst({
          where: { id: { in: nodeConnections.map((c: { toId: string }) => c.toId) }, zoneType: 'wild' },
          select: { id: true },
        });
        if (wildZone) {
          // Resource nodes
          const oreNode = await tx.resourceNode.findFirst({
            where: { zoneId: wildZone.id, resourceType: 'Copper Ore' },
            select: { id: true },
          });
          const logNode = await tx.resourceNode.findFirst({
            where: { zoneId: wildZone.id, resourceType: 'Oak Log' },
            select: { id: true },
          });
          const nodeData: Array<{ playerId: string; resourceNodeId: string; remainingCapacity: number; decayedCapacity: number }> = [];
          if (oreNode) nodeData.push({ playerId: created.id, resourceNodeId: oreNode.id, remainingCapacity: 6, decayedCapacity: 0 });
          if (logNode) nodeData.push({ playerId: created.id, resourceNodeId: logNode.id, remainingCapacity: 6, decayedCapacity: 0 });
          if (nodeData.length > 0) {
            await tx.playerResourceNode.createMany({ data: nodeData });
          }

          // Encounter site
          const zoneMobFamily = await tx.zoneMobFamily.findFirst({
            where: { zoneId: wildZone.id },
            orderBy: { discoveryWeight: 'desc' },
            select: { mobFamilyId: true, mobFamily: { select: { name: true, siteNounSmall: true } } },
          });
          if (zoneMobFamily) {
            const fieldMouse = await tx.mobTemplate.findFirst({
              where: { zoneId: wildZone.id, name: 'Field Mouse' },
              select: { id: true },
            });
            if (fieldMouse) {
              const mobs = [{ slot: 0, mobTemplateId: fieldMouse.id, role: 'trash', prefix: null, status: 'alive', room: 1 }];
              const siteName = `Small ${zoneMobFamily.mobFamily.name} ${zoneMobFamily.mobFamily.siteNounSmall}`;
              await tx.encounterSite.create({
                data: {
                  playerId: created.id,
                  zoneId: wildZone.id,
                  mobFamilyId: zoneMobFamily.mobFamilyId,
                  name: siteName,
                  size: 'small',
                  mobs: { mobs },
                },
              });
            }
          }
        }
      }
    }

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
    },
    accessToken,
    refreshToken,
  });
}));

authRouter.post('/login', loginLimiter, asyncHandler(async (req, res) => {
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
