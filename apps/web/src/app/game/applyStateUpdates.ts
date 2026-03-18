import type { StateUpdates, InventoryItemDTO, HpState, SkillStateDTO, PlayerBuffData, ResourceStateDTO } from '@pocketrealm/shared';

export interface EquipmentSlotState {
  slot: string;
  itemId: string | null;
  item: { id: string; currentDurability: number | null; maxDurability: number | null; [key: string]: unknown } | null;
}

export interface StateSetters {
  setInventory: (updater: (prev: InventoryItemDTO[]) => InventoryItemDTO[]) => void;
  setInventoryCapacity: (n: number) => void;
  setInventoryUsedSlots: (n: number) => void;
  setEquipment: (eq: Record<string, InventoryItemDTO | null>) => void;
  updateEquipmentItems: (updater: (prev: EquipmentSlotState[]) => EquipmentSlotState[]) => void;
  setSkills: (skills: SkillStateDTO[]) => void;
  setHpState: (hp: HpState) => void;
  setStaminaState: (partial: Partial<ResourceStateDTO>) => void;
  setManaState: (partial: Partial<ResourceStateDTO>) => void;
  setGold: (g: number) => void;
  setActiveBuffs: (b: PlayerBuffData[]) => void;
  setCharacterProgression: (cp: NonNullable<StateUpdates['characterProgression']>) => void;
  setMaterialTotals: (mt: Record<string, number>) => void;
}

export function applyStateUpdates(
  updates: StateUpdates | undefined,
  setters: StateSetters,
): void {
  if (!updates) return;

  if (updates.inventoryAdded || updates.inventoryRemoved || updates.inventoryUpdated) {
    setters.setInventory((prev) => {
      let next = [...prev];
      if (updates.inventoryRemoved) {
        const removeSet = new Set(updates.inventoryRemoved);
        next = next.filter((item) => !removeSet.has(item.id));
      }
      if (updates.inventoryUpdated) {
        const updateMap = new Map(updates.inventoryUpdated.map((i) => [i.id, i]));
        next = next.map((item) => updateMap.get(item.id) ?? item);
      }
      if (updates.inventoryAdded) {
        next.push(...updates.inventoryAdded);
      }
      return next;
    });
  }

  // Sync equipment state when inventoryUpdated includes equipped items (e.g. after repair)
  if (updates.inventoryUpdated) {
    const updateMap = new Map(updates.inventoryUpdated.map((i) => [i.id, i]));
    setters.updateEquipmentItems((prev) => {
      let changed = false;
      const next = prev.map((slot) => {
        if (!slot.item || !slot.itemId) return slot;
        const updated = updateMap.get(slot.itemId);
        if (!updated) return slot;
        changed = true;
        return {
          ...slot,
          item: { ...slot.item, currentDurability: updated.currentDurability, maxDurability: updated.maxDurability, bonusStats: updated.bonusStats, rarity: updated.rarity },
        };
      });
      return changed ? next : prev;
    });
  }

  if (updates.equipment !== undefined) setters.setEquipment(updates.equipment);
  if (updates.skills !== undefined) setters.setSkills(updates.skills);
  if (updates.hp !== undefined) setters.setHpState(updates.hp);
  if (updates.resources !== undefined) {
    setters.setStaminaState(updates.resources.stamina);
    setters.setManaState(updates.resources.mana);
  }
  if (updates.gold !== undefined) setters.setGold(updates.gold);
  if (updates.buffs !== undefined) setters.setActiveBuffs(updates.buffs);
  if (updates.inventoryCapacity !== undefined) setters.setInventoryCapacity(updates.inventoryCapacity);
  if (updates.inventoryUsedSlots !== undefined) setters.setInventoryUsedSlots(updates.inventoryUsedSlots);
  if (updates.characterProgression !== undefined) setters.setCharacterProgression(updates.characterProgression);
  if (updates.materialTotals !== undefined) setters.setMaterialTotals(updates.materialTotals);
}
