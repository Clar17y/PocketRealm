interface RankCategoryOption {
  name: string;
  value: string;
  aliases?: string[];
}

const SKILL_CATEGORY_OPTIONS: RankCategoryOption[] = [
  { name: 'Melee', value: 'skill_melee' },
  { name: 'Ranged', value: 'skill_ranged' },
  { name: 'Magic', value: 'skill_magic' },
  { name: 'Mining', value: 'skill_mining' },
  { name: 'Foraging', value: 'skill_foraging' },
  { name: 'Woodcutting', value: 'skill_woodcutting', aliases: ['woodcutting', 'wood cutting'] },
  { name: 'Refining', value: 'skill_refining' },
  { name: 'Tanning', value: 'skill_tanning' },
  { name: 'Weaving', value: 'skill_weaving' },
  { name: 'Weaponsmithing', value: 'skill_weaponsmithing', aliases: ['weapon smithing'] },
  { name: 'Armorsmithing', value: 'skill_armorsmithing', aliases: ['armor smithing', 'armour smithing'] },
  { name: 'Leatherworking', value: 'skill_leatherworking', aliases: ['leather working'] },
  { name: 'Tailoring', value: 'skill_tailoring' },
  { name: 'Alchemy', value: 'skill_alchemy' },
];

export const RANK_CATEGORY_OPTIONS: RankCategoryOption[] = [
  { name: 'Character Level', value: 'character_level', aliases: ['level', 'character'] },
  { name: 'Total XP', value: 'character_xp', aliases: ['xp', 'experience', 'character xp'] },
  { name: 'Total Skill Level', value: 'total_skill_level', aliases: ['skills', 'skill level'] },
  { name: 'PvP Rating', value: 'pvp_rating', aliases: ['pvp', 'rating', 'arena'] },
  { name: 'PvP Wins', value: 'pvp_wins', aliases: ['wins'] },
  { name: 'Best Rating', value: 'pvp_best_rating', aliases: ['best pvp rating'] },
  { name: 'Win Streak', value: 'pvp_win_streak', aliases: ['streak'] },
  { name: 'Total Kills', value: 'total_kills', aliases: ['kills'] },
  { name: 'Boss Damage', value: 'boss_damage', aliases: ['boss'] },
  { name: 'Casino Profit', value: 'casino_profit', aliases: ['profit'] },
  { name: 'Total Wagered', value: 'casino_wagered', aliases: ['wagered'] },
  ...SKILL_CATEGORY_OPTIONS,
];

export function resolveRankCategory(input: string): string | null {
  const normalizedInput = normalizeCategoryText(input);
  if (!normalizedInput) return null;

  const match = RANK_CATEGORY_OPTIONS.find((option) => categorySearchTexts(option).includes(normalizedInput));
  return match?.value ?? null;
}

export function getRankCategoryAutocompleteChoices(input: string): Array<{ name: string; value: string }> {
  const normalizedInput = normalizeCategoryText(input);
  const options = normalizedInput
    ? RANK_CATEGORY_OPTIONS.filter((option) =>
        categorySearchTexts(option).some((text) => text.includes(normalizedInput)),
      )
    : RANK_CATEGORY_OPTIONS;

  return options
    .slice(0, 25)
    .map(({ name, value }) => ({ name, value }));
}

function categorySearchTexts(option: RankCategoryOption): string[] {
  return [
    option.name,
    option.value,
    ...(option.aliases ?? []),
  ].map(normalizeCategoryText);
}

function normalizeCategoryText(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[_-]+/g, ' ')
    .replace(/[^a-z0-9&\s]/g, '')
    .replace(/\s+/g, ' ');
}
