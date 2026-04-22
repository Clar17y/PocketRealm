import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import {
  discoverAllAdminZones,
  listAdminMobFamilies,
  listAdminResourceNodes,
  listAdminZones,
  spawnAdminEncounter,
  spawnAdminResourceNode,
  teleportAdminPlayer,
} from '../../services/admin/zoneAdminService';

const teleportSchema = z.object({
  zoneId: z.string().uuid(),
});

const spawnEncounterSchema = z.object({
  mobFamilyId: z.string().uuid(),
  zoneId: z.string().uuid(),
  size: z.enum(['small', 'medium', 'large']),
});

const spawnResourceNodeSchema = z.object({
  resourceNodeId: z.string().uuid(),
  capacity: z.number().int().min(1).max(10000).optional(),
});

export function registerWorldAdminRoutes(router: Router): void {
  router.get('/zones', asyncHandler(async (_req, res) => {
    const zones = await listAdminZones();
    res.json({ zones });
  }));

  router.post('/zones/discover-all', asyncHandler(async (req, res) => {
    const result = await discoverAllAdminZones(req.player!.playerId);
    res.json({ success: true, ...result });
  }));

  router.post('/zones/teleport', asyncHandler(async (req, res) => {
    const { zoneId } = teleportSchema.parse(req.body);
    const result = await teleportAdminPlayer(req.player!.playerId, zoneId);
    res.json({ success: true, ...result });
  }));

  router.get('/mob-families', asyncHandler(async (req, res) => {
    const zoneId = typeof req.query.zoneId === 'string' ? req.query.zoneId : undefined;
    const families = await listAdminMobFamilies(zoneId);
    res.json({ families });
  }));

  router.post('/encounter/spawn', asyncHandler(async (req, res) => {
    const body = spawnEncounterSchema.parse(req.body);
    const result = await spawnAdminEncounter(req.player!.playerId, body);

    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json({ success: true, site: result.site });
  }));

  router.get('/resource-nodes', asyncHandler(async (req, res) => {
    const zoneId = typeof req.query.zoneId === 'string' ? req.query.zoneId : undefined;
    const nodes = await listAdminResourceNodes(zoneId);
    res.json({ nodes });
  }));

  router.post('/resource-nodes/spawn', asyncHandler(async (req, res) => {
    const body = spawnResourceNodeSchema.parse(req.body);
    const result = await spawnAdminResourceNode(req.player!.playerId, body);
    res.json({ success: true, ...result });
  }));
}
