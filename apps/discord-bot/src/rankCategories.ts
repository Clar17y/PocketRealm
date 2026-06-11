import { CROWN_CONSTANTS } from '@pocketrealm/shared/constants/gameConstants';

interface RankCategoryOption {
  name: string;
  value: string;
  aliases?: string[];
}

// Slugs derive from the canonical player category list (guild leaderboards excluded
// there), so leaderboard categories added to the API surface here automatically.
const PLAYER_CATEGORY_SLUGS: string[] = Object.values(CROWN_CONSTANTS.CATEGORY_GROUPS).flat();

const CATEGORY_DISPLAY: Record<string, { name?: string; aliases?: string[] }> = {
  character_level: { aliases: ['level', 'character'] },
  character_xp: { name: 'Total XP', aliases: ['xp', 'experience', 'character xp'] },
  total_skill_level: { aliases: ['skills', 'skill level'] },
  pvp_rating: { name: 'PvP Rating', aliases: ['pvp', 'rating', 'arena'] },
  pvp_wins: { name: 'PvP Wins', aliases: ['wins'] },
  pvp_best_rating: { name: 'Best Rating', aliases: ['best pvp rating'] },
  pvp_win_streak: { name: 'Win Streak', aliases: ['streak'] },
  total_kills: { aliases: ['kills'] },
  boss_damage: { aliases: ['boss'] },
  casino_profit: { aliases: ['profit'] },
  casino_wagered: { name: 'Total Wagered', aliases: ['wagered'] },
  skill_woodcutting: { aliases: ['wood cutting'] },
  skill_weaponsmithing: { aliases: ['weapon smithing'] },
  skill_armorsmithing: { aliases: ['armor smithing', 'armour smithing'] },
  skill_leatherworking: { aliases: ['leather working'] },
};

export const RANK_CATEGORY_OPTIONS: RankCategoryOption[] = PLAYER_CATEGORY_SLUGS.map((value) => {
  const display = CATEGORY_DISPLAY[value];
  return {
    name: display?.name ?? defaultCategoryName(value),
    value,
    aliases: display?.aliases,
  };
});

export const INVALID_RANK_CATEGORY_COPY = `Unknown ranking category. Pick a category from autocomplete, or try ${RANK_CATEGORY_OPTIONS.slice(0, 5)
  .map((option) => option.value)
  .join(', ')}.`;

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

function defaultCategoryName(slug: string): string {
  return slug
    .replace(/^skill_/, '')
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
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
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}
