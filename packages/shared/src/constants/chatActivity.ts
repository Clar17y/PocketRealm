import type { NpcKey } from './npcDialogue';
import type { ChatActivityEventType, ChatActivityRecord } from '../types/chat.types';

export { CHAT_ACTIVITY_EVENT_TYPES } from '../types/chat.types';

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'epic', 'legendary'] as const;
const METAL_CRAFT_NPC_KEYS = new Set<NpcKey>([
  'millbrook-blacksmith',
  'thornwall-blacksmith',
  'thornwall-weaponsmithing',
  'thornwall-armorsmithing',
  'thornwall-refining',
] as const);

type KnownRarity = (typeof RARITY_ORDER)[number];

function isKnownRarity(value: string): value is KnownRarity {
  return RARITY_ORDER.includes(value as KnownRarity);
}

function isMetalCraftNpc(npcKey: NpcKey): boolean {
  return npcKey.startsWith('kessa-') || METAL_CRAFT_NPC_KEYS.has(npcKey);
}

export function capitalise(value: string): string {
  return value.length === 0 ? value : `${value[0]!.toUpperCase()}${value.slice(1)}`;
}

export function isRarityAtLeast(rarity: string | null | undefined, minRarity: string): boolean {
  if (!rarity || !isKnownRarity(rarity) || !isKnownRarity(minRarity)) {
    return false;
  }

  return RARITY_ORDER.indexOf(rarity) >= RARITY_ORDER.indexOf(minRarity);
}

export function formatChatActivityMessage(
  eventType: ChatActivityEventType,
  activity: Pick<ChatActivityRecord, 'actorUsername' | 'subjectName' | 'subjectRarity' | 'metadata'>,
): string {
  const actor = activity.actorUsername ?? 'Someone';
  const subject = activity.subjectName ?? 'something noteworthy';
  const rarity = activity.subjectRarity ? `${capitalise(activity.subjectRarity)} ` : '';

  switch (eventType) {
    case 'rare_loot':
      return `${actor} found a ${rarity}${subject}.`;
    case 'craft_crit':
      return `${actor} crafted an ${rarity}${subject}.`
        .replace(' an Rare ', ' a Rare ')
        .replace(' an Legendary ', ' a Legendary ');
    case 'zone_discovery':
      return `${actor} discovered a passage to the ${subject}.`;
    case 'achievement':
      return `${actor} earned the achievement ${subject}.`;
    case 'boss_defeat':
      return `${subject} has been defeated.`;
    case 'server_milestone':
      return subject;
  }
}

export interface NpcActivityRelevance {
  relevant: boolean;
  preferOwn: boolean;
}

export function getNpcActivityRelevance(npcKey: NpcKey, activity: ChatActivityRecord): NpcActivityRelevance {
  const skillType = typeof activity.metadata.skillType === 'string' ? activity.metadata.skillType : null;

  if (activity.eventType === 'craft_crit') {
    if (isMetalCraftNpc(npcKey)) {
      return { relevant: ['weaponsmithing', 'armorsmithing', 'refining'].includes(skillType ?? ''), preferOwn: true };
    }
    if (npcKey.includes('artisan')) {
      return { relevant: ['leatherworking', 'tailoring', 'weaving', 'tanning'].includes(skillType ?? ''), preferOwn: true };
    }
    if (npcKey.includes('jeweller')) {
      return { relevant: skillType === 'jewelcrafting', preferOwn: true };
    }
    if (npcKey.includes('herbalist')) {
      return { relevant: skillType === 'alchemy', preferOwn: true };
    }
  }

  if (activity.eventType === 'rare_loot' && npcKey === 'millbrook-general-store') {
    return { relevant: true, preferOwn: true };
  }

  if ((activity.eventType === 'boss_defeat' || activity.eventType === 'zone_discovery') && npcKey === 'town-guard') {
    return { relevant: true, preferOwn: false };
  }

  if ((activity.eventType === 'achievement' || activity.eventType === 'server_milestone') && npcKey === 'millbrook-quest-board') {
    return { relevant: true, preferOwn: false };
  }

  return { relevant: false, preferOwn: false };
}

export function getNpcActivityReactionLine(npcKey: NpcKey, activity: ChatActivityRecord): string | null {
  const rarity = activity.subjectRarity ? `${capitalise(activity.subjectRarity)} ` : '';
  const subject = `${rarity}${activity.subjectName ?? 'work'}`;

  if (activity.eventType === 'craft_crit' && isMetalCraftNpc(npcKey)) {
    return `${subject}, was it? Good. Means somebody was listening at the anvil.`;
  }
  if (activity.eventType === 'craft_crit' && npcKey.includes('artisan')) {
    return `${subject}. Clean work gets noticed faster than loud work.`;
  }
  if (activity.eventType === 'craft_crit' && npcKey.includes('jeweller')) {
    return `${subject}. Good stones deserve careful hands, and careful hands deserve witnesses.`;
  }
  if (activity.eventType === 'rare_loot' && npcKey === 'millbrook-general-store') {
    return `${subject} from the wilds? Put it somewhere dry before it becomes my problem.`;
  }
  if (activity.eventType === 'boss_defeat' && npcKey === 'town-guard') {
    return `${activity.subjectName ?? 'That boss'} falling will make tonight's watch easier. For once.`;
  }
  if (activity.eventType === 'zone_discovery' && npcKey === 'town-guard') {
    return `A new path to ${activity.subjectName ?? 'the wilds'} means new patrol routes. Naturally.`;
  }
  if (activity.eventType === 'achievement' && npcKey === 'millbrook-quest-board') {
    return `${activity.actorUsername ?? 'Someone'} earned ${activity.subjectName ?? 'a new mark'}? Good. I will update the ledger.`;
  }
  if (activity.eventType === 'server_milestone' && npcKey === 'millbrook-quest-board') {
    return activity.subjectName ?? activity.message;
  }
  return null;
}
