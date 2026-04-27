import { CROWN_CONSTANTS } from '@pocketrealm/shared';

export type CrownGroup = keyof typeof CROWN_CONSTANTS.CATEGORY_GROUPS;

export function crownGroupForCategory(category: string): CrownGroup | null {
  for (const group of Object.keys(CROWN_CONSTANTS.CATEGORY_GROUPS) as CrownGroup[]) {
    if (CROWN_CONSTANTS.CATEGORY_GROUPS[group].includes(category)) {
      return group;
    }
  }

  return null;
}
