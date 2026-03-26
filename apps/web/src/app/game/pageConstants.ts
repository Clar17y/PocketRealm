import { Sword, Shield, Crosshair, Sparkles, Pickaxe, Hammer, Leaf, FlaskConical, Axe, Scissors, Anvil, Gem } from 'lucide-react';

export const SKILL_META: Record<string, { name: string; icon: typeof Sword; color: string }> = {
  melee: { name: 'Melee', icon: Sword, color: 'var(--rpg-red)' },
  ranged: { name: 'Ranged', icon: Crosshair, color: 'var(--rpg-green-light)' },
  magic: { name: 'Magic', icon: Sparkles, color: 'var(--rpg-purple)' },
  mining: { name: 'Mining', icon: Pickaxe, color: 'var(--rpg-text-secondary)' },
  foraging: { name: 'Foraging', icon: Leaf, color: 'var(--rpg-green-light)' },
  woodcutting: { name: 'Woodcutting', icon: Axe, color: 'var(--rpg-text-secondary)' },
  refining: { name: 'Refining', icon: Hammer, color: 'var(--rpg-blue-light)' },
  tanning: { name: 'Tanning', icon: Shield, color: 'var(--rpg-gold)' },
  weaving: { name: 'Weaving', icon: Scissors, color: 'var(--rpg-purple)' },
  weaponsmithing: { name: 'Weaponsmithing', icon: Hammer, color: 'var(--rpg-gold)' },
  armorsmithing: { name: 'Armorsmithing', icon: Anvil, color: 'var(--rpg-blue-light)' },
  leatherworking: { name: 'Leatherworking', icon: Shield, color: 'var(--rpg-green-light)' },
  tailoring: { name: 'Tailoring', icon: Scissors, color: 'var(--rpg-purple)' },
  alchemy: { name: 'Alchemy', icon: FlaskConical, color: 'var(--rpg-purple)' },
  jewelcrafting: { name: 'Jewelcrafting', icon: Gem, color: 'var(--rpg-gold)' },
};

export const GATHERING_SKILL_TABS = [
  { id: 'mining', label: 'Mining' },
  { id: 'foraging', label: 'Foraging' },
  { id: 'woodcutting', label: 'Woodcutting' },
] as const;

export const CRAFTING_SKILL_TABS = [
  { id: 'refining', label: 'Refining' },
  { id: 'tanning', label: 'Tanning' },
  { id: 'weaving', label: 'Weaving' },
  { id: 'weaponsmithing', label: 'Weaponsmithing' },
  { id: 'armorsmithing', label: 'Armorsmithing' },
  { id: 'leatherworking', label: 'Leatherworking' },
  { id: 'tailoring', label: 'Tailoring' },
  { id: 'alchemy', label: 'Alchemy' },
  { id: 'jewelcrafting', label: 'Jewelcrafting' },
] as const;
