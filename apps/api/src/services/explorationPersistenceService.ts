import { randomUUID } from 'crypto';
import { Prisma, prisma } from '@pocketrealm/database';
import { storePendingLoot, type PendingLootItem } from './pendingLootService';
import { grantCacheLootTx } from './cacheLootService';
import { getInventoryState } from './inventoryService';
import type { NarrativeEvent, PendingResourceDiscovery, PendingEncounterSiteDiscovery, PendingAmbushCombatLog, EncounterSiteSize } from './exploration/helpers';

interface PendingCacheLootEntry {
  turnOccurred: number;
  mobFamilyId: string;
}

interface HiddenCacheEntry {
  turnOccurred: number;
  loot?: Array<{ itemTemplateId: string; name: string; quantity: number }>;
  soulboundItem?: { itemTemplateId: string; name: string; rarity: string } | null;
}

export interface PersistenceResult {
  logId: string;
  resourceDiscoveries: Array<{
    turnOccurred: number;
    playerNodeId: string;
    resourceNodeId: string;
    resourceType: string;
    capacity: number;
    sizeName: string;
  }>;
  encounterSites: Array<{
    turnOccurred: number;
    encounterSiteId: string;
    mobFamilyId: string;
    siteName: string;
    size: EncounterSiteSize;
    totalMobs: number;
    discoveredAt: string;
  }>;
  combatLogIds: string[];
  cacheOverflow: PendingLootItem[];
}

export async function persistExplorationResults(params: {
  playerId: string;
  zoneId: string;
  zoneName: string;
  turnsToSpend: number;
  aborted: boolean;
  abortedAtTurn: number | null;
  refundAmount: number;
  events: NarrativeEvent[];
  pendingResources: PendingResourceDiscovery[];
  pendingSites: PendingEncounterSiteDiscovery[];
  pendingCombatLogs: PendingAmbushCombatLog[];
  pendingCacheLoot: PendingCacheLootEntry[];
  hiddenCaches: HiddenCacheEntry[];
  allNewItemIds: string[];
  allUpdatedItemIds: string[];
  currentHp: number;
  zoneExitDiscovered: boolean;
  luck: number;
}): Promise<PersistenceResult & { cachePendingLootSessionId: string | null }> {
  const {
    playerId,
    zoneId,
    zoneName,
    turnsToSpend,
    aborted,
    abortedAtTurn,
    refundAmount,
    events,
    pendingResources,
    pendingSites,
    pendingCombatLogs,
    pendingCacheLoot,
    hiddenCaches,
    allNewItemIds,
    allUpdatedItemIds,
    currentHp,
    zoneExitDiscovered,
    luck,
  } = params;

  // Compute available slots for capacity-aware cache loot
  let { availableSlots } = await getInventoryState(playerId);

  const persisted = await prisma.$transaction(async (tx) => {
    const resourceRows = pendingResources.map((discovery) => ({
      id: randomUUID(),
      playerId,
      resourceNodeId: discovery.resourceNodeId,
      remainingCapacity: discovery.capacity,
      decayedCapacity: 0,
    }));
    if (resourceRows.length > 0) {
      await tx.playerResourceNode.createMany({ data: resourceRows });
    }
    const createdResourceDiscoveries = pendingResources.map((discovery, index) => ({
      turnOccurred: discovery.turnOccurred,
      playerNodeId: resourceRows[index]!.id,
      resourceNodeId: discovery.resourceNodeId,
      resourceType: discovery.resourceType,
      capacity: discovery.capacity,
      sizeName: discovery.sizeName,
    }));

    const siteRows = pendingSites.map((discovery) => ({
      id: randomUUID(),
      playerId,
      zoneId,
      mobFamilyId: discovery.mobFamilyId,
      name: discovery.siteName,
      size: discovery.size,
      mobs: { mobs: discovery.mobs } as unknown as Prisma.InputJsonValue,
      totalRooms: new Set(discovery.mobs.map((m) => m.room)).size,
      discoveredAt: new Date(),
    }));
    if (siteRows.length > 0) {
      await tx.encounterSite.createMany({ data: siteRows });
    }
    const createdEncounterSites = pendingSites.map((discovery, index) => ({
      turnOccurred: discovery.turnOccurred,
      encounterSiteId: siteRows[index]!.id,
      mobFamilyId: discovery.mobFamilyId,
      siteName: discovery.siteName,
      size: discovery.size,
      totalMobs: discovery.mobs.length,
      discoveredAt: siteRows[index]!.discoveredAt.toISOString(),
    }));

    const combatLogRows = pendingCombatLogs.map((combatLog) => ({
      id: randomUUID(),
      playerId,
      activityType: 'combat',
      turnsSpent: combatLog.turnsSpent,
      result: combatLog.result as Prisma.InputJsonValue,
    }));
    if (combatLogRows.length > 0) {
      await tx.activityLog.createMany({ data: combatLogRows });
    }
    const createdCombatLogIds = combatLogRows.map((combatLog) => combatLog.id);

    // Grant hidden cache loot (capacity-aware)
    const allCacheOverflow: PendingLootItem[] = [];
    for (const cache of pendingCacheLoot) {
      const cacheLoot = await grantCacheLootTx(tx, {
        playerId,
        zoneId,
        mobFamilyId: cache.mobFamilyId,
        luck,
        availableSlots,
      });
      availableSlots = Math.max(0, availableSlots - cacheLoot.slotsConsumed);
      allCacheOverflow.push(...cacheLoot.overflow);
      allNewItemIds.push(...cacheLoot.newItemIds);
      allUpdatedItemIds.push(...cacheLoot.updatedItemIds);

      const lootSummary = cacheLoot.materials.map((m) => ({
        itemTemplateId: m.itemTemplateId,
        name: m.name,
        quantity: m.quantity,
      }));

      // Build human-readable description listing actual items
      const itemList = lootSummary.map((m) => `${m.quantity}x ${m.name}`).join(', ');

      // Update the corresponding event's details
      const cacheEvent = events.find((e) => e.type === 'hidden_cache' && e.turn === cache.turnOccurred);
      if (cacheEvent) {
        cacheEvent.details = {
          materials: lootSummary,
          soulboundItem: cacheLoot.soulboundItem,
        };
        if (cacheLoot.soulboundItem) {
          const article = /^[aeiou]/i.test(cacheLoot.soulboundItem.rarity) ? 'an' : 'a';
          cacheEvent.description = `You found a hidden cache containing ${article} ${cacheLoot.soulboundItem.rarity} ${cacheLoot.soulboundItem.name}! (${itemList})`;
        } else {
          cacheEvent.description = `You found a hidden cache: ${itemList}`;
        }
      }

      // Enrich hiddenCaches response entry with loot details
      const cacheEntry = hiddenCaches.find((h) => h.turnOccurred === cache.turnOccurred);
      if (cacheEntry) {
        cacheEntry.loot = lootSummary;
        cacheEntry.soulboundItem = cacheLoot.soulboundItem;
      }
    }

    // Strip combat logs from events stored in the exploration activity log
    // (full logs are already stored in separate combat activity log records)
    const cleanedEvents = events.map((ev) => {
      if ((ev.type === 'ambush_victory' || ev.type === 'ambush_defeat') && ev.details) {
        const { log: _log, ...rest } = ev.details;
        return { ...ev, details: rest };
      }
      return ev;
    });

    const explorationLog = await tx.activityLog.create({
      data: {
        playerId,
        activityType: 'exploration',
        turnsSpent: turnsToSpend,
        result: {
          zoneId,
          zoneName,
          aborted,
          abortedAtTurn,
          refundedTurns: refundAmount,
          events: cleanedEvents,
          resourceDiscoveries: createdResourceDiscoveries,
          encounterSites: createdEncounterSites,
          hiddenCaches,
          zoneExitDiscovered,
          finalHp: currentHp,
        } as unknown as Prisma.InputJsonValue,
      },
      select: { id: true },
    });

    return {
      logId: explorationLog.id,
      resourceDiscoveries: createdResourceDiscoveries,
      encounterSites: createdEncounterSites,
      combatLogIds: createdCombatLogIds,
      cacheOverflow: allCacheOverflow,
    };
  });

  // Store cache overflow as pending loot (if any)
  let cachePendingLootSessionId: string | null = null;
  if (persisted.cacheOverflow.length > 0) {
    cachePendingLootSessionId = await storePendingLoot(playerId, persisted.cacheOverflow);
  }

  return { ...persisted, cachePendingLootSessionId };
}
