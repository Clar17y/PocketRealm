# Security Audit: Inventory & Equipment System

## Files Reviewed
- `apps/api/src/routes/inventory.ts` — 14 inventory route handlers (CRUD, repair, sell, stash, loot)
- `apps/api/src/routes/equipment.ts` — equip, unequip, init endpoints
- `apps/api/src/services/sellService.ts` — `sellItem`, `sellBulk`
- `apps/api/src/services/stashService.ts` — deposit/withdraw (single + batch), `moveStackableItem`
- `apps/api/src/services/equipmentService.ts` — `equipItem`, `unequipSlot`, `getEquipmentStats`
- `apps/api/src/services/consumableService.ts` — `useConsumable` (potion healing)
- `apps/api/src/services/pendingLootService.ts` — Redis-based loot staging and claiming
- `apps/api/src/services/repairService.ts` — `repairItemDurability`, `repairAllEquipped`
- `apps/api/src/services/inventoryService.ts` — capacity checks, stack management
- `apps/api/src/utils/routeHelpers.ts` — `getOwnedItem`, `assertInTown`

## Findings

### 1. Pending Loot Can Be Claimed Multiple Times Before Redis Delete
**Severity:** high
**Type:** race condition

**Description:** In `pendingLootService.ts:59-97`, `claimPendingLoot` reads loot data from Redis (line 65), creates items in a Prisma transaction (lines 75-94), then deletes the Redis key (line 96). The Redis read and delete are NOT atomic — between the transaction commit and the `redis.del()`, a second concurrent request can read the same key and claim the same loot again.

**Exploit Scenario:**
1. Player completes combat, receiving a pending loot session with a legendary weapon.
2. Player sends two simultaneous `POST /api/v1/inventory/loot/claim` requests with the same `sessionId`.
3. Both requests read the same Redis key (both get the loot data).
4. Both enter their Prisma transaction and create duplicate items.
5. The first `redis.del()` deletes the key; the second `redis.del()` is a no-op.
6. Player now has two copies of the legendary weapon.

**Suggested Fix:** Use a Redis atomic operation. Either:
- Use `GETDEL` (Redis 6.2+) to atomically read and delete in one step:
  ```ts
  const data = await redis.getdel(key);
  ```
- Or use a Lua script for atomic get-and-delete
- Or set a short TTL/lock before processing:
  ```ts
  const data = await redis.get(key);
  if (!data) throw ...;
  const deleted = await redis.del(key); // Delete FIRST
  if (deleted === 0) throw new AppError(409, 'Loot already claimed', 'LOOT_ALREADY_CLAIMED');
  // Then create items
  ```

---

### 2. Equip Operation Is Not Atomic — Race Can Double-Equip
**Severity:** medium
**Type:** race condition

**Description:** `equipItem` in `equipmentService.ts:92-166` performs multiple non-transactional operations: item lookup (line 99), various checks, clear old slot (line 156), then upsert new slot (line 161). These are individual Prisma calls, not wrapped in a `$transaction`. Two concurrent equip requests for different items into the same slot could interleave, or the same item could end up in multiple slots.

The "clear old slot" step at line 156 (`updateMany` setting `itemId: null` where `itemId` matches) runs before the upsert. In a race between two equip calls for different items to the same slot:

**Exploit Scenario:**
1. Player sends `equip(itemA, main_hand)` and `equip(itemB, main_hand)` simultaneously.
2. Both pass all validation checks.
3. Request 1: clears itemA from any slot, then upserts main_hand → itemA.
4. Request 2: clears itemB from any slot, then upserts main_hand → itemB (overwrites itemA).
5. This is mostly harmless (last write wins), but itemA is now "equipped" according to the clear step but not actually in any slot — potentially causing stat desync.

More concerning: if the same item is equipped to two different valid slots via race (e.g., ring and ring2 if templates allow), the `updateMany` clearing step could leave orphaned state.

**Suggested Fix:** Wrap `equipItem` in a `$transaction`:
```ts
await prisma.$transaction(async (tx) => {
  const item = await tx.item.findUnique({ ... });
  // ... all checks ...
  await tx.playerEquipment.updateMany({ where: { playerId, itemId }, data: { itemId: null } });
  await tx.playerEquipment.upsert({ ... });
});
```

---

### 3. Delete Item Stack: Negative Quantity Possible
**Severity:** medium
**Type:** input manipulation

**Description:** The `DELETE /inventory/:id` route at `inventory.ts:80-100` allows partial stack deletion via `?quantity=N`. Line 89 checks `query.quantity < item.quantity` before doing `item.quantity - query.quantity`. However, `getOwnedItem` is called first (line 85-87), and there's no transaction — the item's quantity could change between the read and the update.

More importantly, the schema validates `quantity` as `z.coerce.number().int().positive().optional()` but doesn't enforce a maximum. The code checks `query.quantity < item.quantity` (strictly less), so if `quantity === item.quantity`, it falls through to the full delete (line 98). This is correct behavior. However, if quantity is somehow greater than `item.quantity`, neither branch handles it:
- `quantity < item.quantity` is false → skips partial update
- Falls through to full delete at line 98

This means sending `quantity: 999999` on a stack of 5 deletes the entire stack, which may be unexpected UX but isn't a security issue. The real risk is the non-transactional read-then-update.

**Suggested Fix:** Wrap in a transaction and validate within it:
```ts
await prisma.$transaction(async (tx) => {
  const item = await tx.item.findUnique({ where: { id: params.id } });
  // validate ownership, equipped status, etc.
  if (stackable && quantity && quantity < item.quantity) {
    await tx.item.update({ ... });
  } else {
    await tx.item.delete({ ... });
  }
});
```

---

### 4. Stash Withdraw Capacity Check Outside Transaction
**Severity:** medium
**Type:** race condition

**Description:** `withdrawItem` in `stashService.ts:87-114` checks backpack capacity (line 93: `getInventoryState`) _outside_ the transaction. Two concurrent withdraw calls could both pass the capacity check when only one slot remains, then both proceed to withdraw items, exceeding backpack capacity.

Similarly, `withdrawBatch` at line 141 reads `availableSlots` outside the transaction, then uses it as a counter inside. The `availableSlots` value could be stale.

**Exploit Scenario:**
1. Player has 1 available backpack slot.
2. Player sends two simultaneous `POST /stash/withdraw` requests for different items.
3. Both read `usedSlots < capacity` → pass.
4. Both create/move items into backpack inside separate transactions.
5. Player now has 2 items in backpack with only 1 slot available → over-encumbered state.

**Suggested Fix:** Check capacity inside the transaction, or use `SELECT ... FOR UPDATE` on the player row to serialize concurrent inventory modifications.

---

### 5. Loot Claim Doesn't Merge Stackable Items
**Severity:** low
**Type:** business logic

**Description:** `claimPendingLoot` at `pendingLootService.ts:75-94` creates a new `item` row for every claimed loot entry (line 81-91), regardless of whether a matching stackable item already exists in the player's backpack. This means claiming 3 stacks of iron ore creates 3 separate item rows instead of merging into an existing stack.

This leads to inventory slot bloat — each claimed loot item consumes a slot even when it should stack. Over time, this can fill up the backpack with duplicate stacks.

**Exploit Scenario:** Not exploitable per se, but causes degraded UX and potential over-encumbrance from loot claims that should merge cleanly.

**Suggested Fix:** Use `addStackableItemTx` for stackable items (check `maxDurability == null && bonusStats == null` as the stackable heuristic, or look up the template's `stackable` field).

---

### 6. Sell Bulk Accepts Duplicate Item IDs
**Severity:** low
**Type:** input manipulation

**Description:** The `sellBulkSchema` at `inventory.ts:203` validates `itemIds: z.array(z.string().uuid()).min(1).max(50)` without deduplication. However, `sellBulk` in `sellService.ts:62-90` iterates over `itemIds` and calls `tx.item.findUnique` + `tx.item.delete` for each. If duplicates are passed:
1. First occurrence: finds and deletes the item, earns gold.
2. Second occurrence: `findUnique` returns null (already deleted), `continue` at line 71.

This is safe — the duplicate is a no-op. But it wastes a DB query per duplicate.

**Suggested Fix:** Deduplicate in the schema: `.transform(ids => [...new Set(ids)])`.

---

### 7. Equipment Init Endpoint Has No Idempotency Guard
**Severity:** info
**Type:** business logic

**Description:** `POST /equipment/init` at `equipment.ts:69-72` calls `ensureEquipmentSlots(playerId)` which checks for existing slots and only creates missing ones. This is already idempotent. However, the endpoint is described as a "dev helper" and is exposed in production behind only the `authenticate` middleware. Any authenticated player can call it.

**Assessment:** Not exploitable since `ensureEquipmentSlots` is safe to call multiple times. But a production endpoint labeled "dev helper" should either be gated behind admin middleware or removed.

**Suggested Fix:** Either gate behind `admin` middleware or remove the route if `ensureEquipmentSlots` is called automatically elsewhere (it's called at the start of `equipItem`).

---

### 8. Consumable Use: Heal Calculation Outside Transaction
**Severity:** low
**Type:** race condition

**Description:** `useConsumable` in `consumableService.ts:46-63` reads HP state and calculates heal amount _outside_ the transaction. The transaction at line 66 uses optimistic locking (line 78-83: `updateMany` with `WHERE currentHp = X AND lastHpRegenAt = Y`) to detect concurrent changes. If the HP state changed, it throws a 409 error.

This is actually well-implemented — the optimistic lock prevents double-healing. The player gets an error and retries. The only downside is that passive HP regen between the read and the transaction could cause spurious 409 errors if the regen timestamp changes.

**Assessment:** Good pattern. The optimistic lock is the right approach here. Low severity only because of the spurious error potential.

---

### 9. Repair Service: No Town Check
**Severity:** low
**Type:** business logic

**Description:** The `POST /inventory/repair` and `POST /inventory/repair-equipped` routes at `inventory.ts:110-171` don't call `assertInTown(playerId)`. Players can repair equipment from anywhere — in the wild, in dungeons, during exploration. Other item management operations like sell, stash deposit/withdraw all require being in town.

**Exploit Scenario:**
1. Player's weapon breaks during combat in a dangerous zone.
2. Player repairs it immediately from the field without traveling back to town.
3. This bypasses the intended logistics of the zone/travel system where returning to town is a meaningful cost.

**Suggested Fix:** Add `await assertInTown(playerId)` at the start of both repair routes if repair is meant to require town access, consistent with sell/stash operations.

---

## Summary

| # | Finding | Severity | Exploitable? |
|---|---------|----------|-------------|
| 1 | **Pending loot double-claim via Redis race** | high | Yes — item duplication |
| 2 | Equip not transactional — concurrent equip desync | medium | Yes — stat desync |
| 3 | Delete stack non-transactional read-then-update | medium | Edge case — race only |
| 4 | Stash withdraw capacity check outside transaction | medium | Yes — exceeds capacity |
| 5 | Loot claim doesn't merge stackable items | low | UX degradation |
| 6 | Sell bulk accepts duplicate IDs | low | No — safe no-op |
| 7 | Equipment init is a dev endpoint in production | info | No — idempotent |
| 8 | Consumable heal calc outside transaction | low | No — optimistic lock protects |
| 9 | Repair has no town check unlike other operations | low | Yes — bypasses travel system |
