import { escapeDiscordText, truncateText } from '../utils.js';
import type { DiscordEmojiMap } from './emojis.js';
import { statusCard, textCard, type V2CardPayload } from './v2Card.js';

const MAX_LIST = 15;
const MAX_RESOURCE_ZONES = 8;
const MAX_FLAVOR = 300;

export interface ItemCardData {
  name: string;
  itemType: string;
  slot: string | null;
  tier: number;
  weightClass: string | null;
  requiredSkill: string | null;
  requiredLevel: number;
  sellPrice: number | null;
  flavorText: string | null;
  season: { name: string } | null;
  stats: Array<{ key: string; value: number }>;
  sources: {
    drops: Array<{ mobName: string; zoneName: string; dropRatePct: number; minQty: number; maxQty: number }>;
    craft: {
      skillType: string;
      requiredLevel: number;
      turnCost: number;
      xpReward: number;
      materials: Array<{ name: string; quantity: number }>;
    } | null;
  };
}

export interface MobCardData {
  name: string;
  isBoss: boolean;
  isExpeditionMob: boolean;
  season: { name: string } | null;
  zones: string[];
  flavorAppearance: string | null;
  drops: Array<{ itemName: string; itemType: string; tier: number; dropRatePct: number; minQty: number; maxQty: number }>;
}

export interface ResourceCardData {
  query: string;
  resources: Array<{
    name: string;
    tier: number | null;
    zones: Array<{
      name: string;
      skillRequired: string;
      levelRequired: number;
      baseYield: number;
      discoveryChancePct: number;
      minCapacity: number;
      maxCapacity: number;
    }>;
  }>;
}

function seasonLine(season: { name: string } | null): string | null {
  return season ? `🗓️ Seasonal — ${escapeDiscordText(season.name)}` : null;
}

function quantityText(min: number, max: number): string {
  return min === max ? `${min}` : `${min}-${max}`;
}

function cappedList<T>(items: T[], render: (item: T) => string): string[] {
  const shown = items.slice(0, MAX_LIST).map(render);
  if (items.length > MAX_LIST) {
    shown.push(`…and ${items.length - MAX_LIST} more`);
  }
  return shown;
}

export function buildItemCard(data: ItemCardData, emojiMap: DiscordEmojiMap): V2CardPayload {
  const lines: string[] = [];

  const meta = [`Type: ${escapeDiscordText(data.itemType)}`, `Tier ${data.tier}`];
  if (data.slot) meta.push(`Slot: ${escapeDiscordText(data.slot)}`);
  if (data.weightClass) meta.push(`${escapeDiscordText(data.weightClass)}`);
  lines.push(meta.join(' • '));

  const season = seasonLine(data.season);
  if (season) lines.push(season);

  if (data.requiredSkill || data.requiredLevel > 1) {
    const req = data.requiredSkill
      ? `${escapeDiscordText(data.requiredSkill)} Lv. ${data.requiredLevel}`
      : `Level ${data.requiredLevel}`;
    lines.push(`**Requires:** ${req}`);
  }

  if (data.stats.length) {
    lines.push('**Stats**');
    for (const stat of data.stats) {
      lines.push(`• ${escapeDiscordText(stat.key)}: ${stat.value}`);
    }
  }

  if (data.sources.drops.length) {
    lines.push('**Dropped by**');
    for (const line of cappedList(data.sources.drops, (drop) =>
      `• ${escapeDiscordText(drop.mobName)} (${escapeDiscordText(drop.zoneName)}) — ${drop.dropRatePct}%`,
    )) {
      lines.push(line);
    }
  }

  if (data.sources.craft) {
    const craft = data.sources.craft;
    lines.push(`**Crafted** (${escapeDiscordText(craft.skillType)} Lv. ${craft.requiredLevel}, ${craft.turnCost} turns)`);
    for (const line of cappedList(craft.materials, (mat) =>
      `• ${escapeDiscordText(mat.name)} ×${mat.quantity}`,
    )) {
      lines.push(line);
    }
  }

  if (!data.sources.drops.length && !data.sources.craft) {
    lines.push('_No known drop or craft source._');
  }

  if (typeof data.sellPrice === 'number') {
    lines.push(`Sell: ${data.sellPrice}g`);
  }

  if (data.flavorText) {
    lines.push(`_${escapeDiscordText(truncateText(data.flavorText, MAX_FLAVOR))}_`);
  }

  return textCard({
    emojiKey: 'item',
    title: escapeDiscordText(data.name),
    emojiMap,
    lines,
  });
}

export function buildMobCard(data: MobCardData, emojiMap: DiscordEmojiMap): V2CardPayload {
  const lines: string[] = [];

  if (data.isBoss) lines.push('**Boss**');

  const season = seasonLine(data.season);
  if (season) lines.push(season);

  if (data.isExpeditionMob) {
    lines.push('**Found in:** Expeditions (expedition only)');
  } else if (data.zones.length) {
    lines.push(`**Found in:** ${data.zones.map(escapeDiscordText).join(', ')}`);
  } else {
    lines.push('**Found in:** _Unknown_');
  }

  if (data.drops.length) {
    lines.push('**Drops**');
    for (const line of cappedList(data.drops, (drop) =>
      `• ${escapeDiscordText(drop.itemName)} — ${drop.dropRatePct}% (×${quantityText(drop.minQty, drop.maxQty)})`,
    )) {
      lines.push(line);
    }
  } else {
    lines.push('_No known drops._');
  }

  if (data.flavorAppearance) {
    lines.push(`_${escapeDiscordText(truncateText(data.flavorAppearance, MAX_FLAVOR))}_`);
  }

  return textCard({
    emojiKey: 'mob',
    title: escapeDiscordText(data.name),
    emojiMap,
    lines,
  });
}

export function buildResourceCard(data: ResourceCardData, emojiMap: DiscordEmojiMap): V2CardPayload {
  const lines: string[] = [];

  for (const resource of data.resources.slice(0, MAX_LIST)) {
    const tier = typeof resource.tier === 'number' ? ` (Tier ${resource.tier})` : '';
    lines.push(`**${escapeDiscordText(resource.name)}${tier}**`);

    for (const zone of resource.zones.slice(0, MAX_RESOURCE_ZONES)) {
      lines.push(
        `• ${escapeDiscordText(zone.name)} — ${escapeDiscordText(zone.skillRequired)} Lv. ${zone.levelRequired}, ${zone.discoveryChancePct}% discovery, capacity ${zone.minCapacity}-${zone.maxCapacity}`,
      );
    }

    if (resource.zones.length > MAX_RESOURCE_ZONES) {
      lines.push(`…and ${resource.zones.length - MAX_RESOURCE_ZONES} more zones`);
    }
  }

  if (data.resources.length > MAX_LIST) {
    lines.push(`…and ${data.resources.length - MAX_LIST} more resources`);
  }

  return textCard({
    emojiKey: 'resource',
    title: `Resources matching "${escapeDiscordText(data.query)}"`,
    emojiMap,
    lines,
  });
}

export function buildSuggestionCard(
  query: string,
  suggestions: string[],
  kind: 'item' | 'mob' | 'resource',
  emojiMap: DiscordEmojiMap,
): V2CardPayload {
  const lines = suggestions.map((name) => `• ${escapeDiscordText(name)}`);
  return textCard({
    emojiKey: kind,
    title: `No exact ${kind} match for "${escapeDiscordText(query)}"`,
    emojiMap,
    lines: ['Did you mean:', ...lines],
  });
}

export function buildNotFoundCard(
  query: string,
  kind: 'item' | 'mob' | 'resource',
  emojiMap: DiscordEmojiMap,
): V2CardPayload {
  return statusCard(
    'info',
    `No ${kind} found`,
    `No ${kind} found for "${escapeDiscordText(query)}".`,
    emojiMap,
  );
}
