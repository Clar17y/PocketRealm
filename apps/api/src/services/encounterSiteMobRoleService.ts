import {
  ENCOUNTER_SITE_ROLE_CONSTANTS,
  getMobPrefixDefinition,
  type BossTemplateAction,
  type DamageType,
  type EncounterMobRole,
  type MobTemplate,
} from '@pocketrealm/shared';

type EncounterRoleTemplate = Pick<
  MobTemplate,
  'hp' | 'accuracy' | 'defence' | 'magicDefence' | 'evasion' | 'damageMin' | 'damageMax' | 'xpReward'
>;

type FamilyTheme =
  | 'spider'
  | 'wolf'
  | 'bandit'
  | 'treant'
  | 'spirit'
  | 'undead'
  | 'caster'
  | 'default';

export function scaleEncounterRoleHp(hp: number, role: EncounterMobRole): number {
  return scale(hp, ENCOUNTER_SITE_ROLE_CONSTANTS.ROLE_STAT_MULTIPLIERS[role].hp, 1);
}

export function applyEncounterRoleModifiers<TMob extends EncounterRoleTemplate>(
  mob: TMob,
  role: EncounterMobRole,
): TMob {
  const multipliers = ENCOUNTER_SITE_ROLE_CONSTANTS.ROLE_STAT_MULTIPLIERS[role];
  const damageMin = scale(mob.damageMin, multipliers.damageMin, 1);
  const damageMax = Math.max(damageMin, scale(mob.damageMax, multipliers.damageMax, 1));

  return {
    ...mob,
    hp: scaleEncounterRoleHp(mob.hp, role),
    accuracy: scale(mob.accuracy, multipliers.accuracy, 0),
    defence: scale(mob.defence, multipliers.defence, 0),
    magicDefence: scale(mob.magicDefence, multipliers.magicDefence, 0),
    evasion: scale(mob.evasion, multipliers.evasion, 0),
    damageMin,
    damageMax,
    xpReward: scale(mob.xpReward, multipliers.xp, 1),
  };
}

export function resolveEncounterRoleActionTemplate(input: {
  role: EncounterMobRole;
  damageType: DamageType;
  familyName: string | null;
  mobName: string;
}): BossTemplateAction[] {
  const basicAttack = input.damageType === 'magic' ? 'boss_magic_attack' : 'boss_physical_attack';
  const basicAction: BossTemplateAction = { actionId: basicAttack, targetMode: 'single_target' };
  const theme = inferFamilyTheme(input.familyName, input.mobName, input.damageType);

  if (input.role === 'trash') {
    return [basicAction];
  }

  if (input.role === 'elite') {
    return [
      basicAction,
      resolveEliteSpecial(theme, input.damageType),
      basicAction,
    ];
  }

  const finisher: BossTemplateAction = input.damageType === 'magic'
    ? { actionId: 'boss_arcane_storm', targetMode: 'aoe', isTelegraphed: true, label: 'ARCANE STORM' }
    : { actionId: 'boss_earthquake', targetMode: 'aoe', isTelegraphed: true, label: 'EARTHQUAKE' };

  return [
    basicAction,
    resolveMiniBossSpecial(theme, input.damageType),
    basicAction,
    finisher,
  ];
}

function scale(value: number, multiplier: number, minimum: number): number {
  return Math.max(minimum, Math.round(value * multiplier));
}

function inferFamilyTheme(
  familyName: string | null,
  mobName: string,
  damageType: DamageType,
): FamilyTheme {
  const text = `${familyName ?? ''} ${mobName}`.toLowerCase();
  for (const [theme, keywords] of Object.entries(ENCOUNTER_SITE_ROLE_CONSTANTS.FAMILY_THEME_KEYWORDS)) {
    if (keywords.some((keyword) => text.includes(keyword))) {
      return theme as FamilyTheme;
    }
  }
  if (damageType === 'magic') return 'caster';
  return 'default';
}

function themedSpecial(
  theme: FamilyTheme,
): { elite: BossTemplateAction; mini_boss: BossTemplateAction } | undefined {
  const map = ENCOUNTER_SITE_ROLE_CONSTANTS.ROLE_SPECIAL_ACTIONS;
  return theme in map ? map[theme as keyof typeof map] : undefined;
}

function resolveDamageTypeSpecial(damageType: DamageType): BossTemplateAction {
  return damageType === 'magic'
    ? { actionId: 'boss_weaken', targetMode: 'aoe' }
    : { actionId: 'boss_enrage', targetMode: 'single_target' };
}

function resolveEliteSpecial(theme: FamilyTheme, damageType: DamageType): BossTemplateAction {
  return themedSpecial(theme)?.elite ?? resolveDamageTypeSpecial(damageType);
}

function resolveMiniBossSpecial(theme: FamilyTheme, damageType: DamageType): BossTemplateAction {
  return themedSpecial(theme)?.mini_boss ?? resolveDamageTypeSpecial(damageType);
}

type EncounterSitePreviewSlot = {
  slot: number;
  prefix: string | null;
  role: EncounterMobRole;
};

type EncounterSitePreviewTemplate = {
  name: string;
  hp: number;
};

/**
 * Builds the role-scaled HP preview for an encounter-site mob, applying the same
 * prefix -> event -> role multiplier chain used when loading mobs into combat.
 */
export function buildEncounterSiteMobPreview(
  slot: EncounterSitePreviewSlot,
  template: EncounterSitePreviewTemplate | undefined,
  mobHpMultiplier: number,
): {
  slot: number;
  name: string;
  prefix: string | null;
  role: EncounterMobRole;
  hp: number;
  maxHp: number;
} {
  if (!template) {
    return {
      slot: slot.slot,
      name: 'Unknown',
      prefix: slot.prefix,
      role: slot.role,
      hp: 0,
      maxHp: 0,
    };
  }

  const prefixDefinition = getMobPrefixDefinition(slot.prefix);
  const prefixedHp = Math.max(1, Math.floor(template.hp * (prefixDefinition?.statMultipliers.hp ?? 1)));
  const eventModifiedHp = Math.max(1, Math.round(prefixedHp * Math.max(0.1, mobHpMultiplier)));
  const hp = scaleEncounterRoleHp(eventModifiedHp, slot.role);

  return {
    slot: slot.slot,
    name: template.name,
    prefix: slot.prefix,
    role: slot.role,
    hp,
    maxHp: hp,
  };
}
