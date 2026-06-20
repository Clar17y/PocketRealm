import {
  ENCOUNTER_SITE_ROLE_CONSTANTS,
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
  if (text.includes('spider') || text.includes('web') || text.includes('venom')) return 'spider';
  if (text.includes('wolf') || text.includes('warg') || text.includes('coyote')) return 'wolf';
  if (text.includes('bandit') || text.includes('goblin')) return 'bandit';
  if (text.includes('treant') || text.includes('golem') || text.includes('bark')) return 'treant';
  if (text.includes('spirit') || text.includes('fae') || text.includes('wisp') || text.includes('witch')) return 'spirit';
  if (text.includes('undead') || text.includes('skeleton') || text.includes('wraith') || text.includes('lich')) return 'undead';
  if (damageType === 'magic') return 'caster';
  return 'default';
}

function resolveEliteSpecial(theme: FamilyTheme, damageType: DamageType): BossTemplateAction {
  switch (theme) {
    case 'spider':
      return { actionId: 'boss_poison_spray', targetMode: 'aoe' };
    case 'wolf':
      return { actionId: 'boss_frenzy', targetMode: 'single_target' };
    case 'bandit':
      return { actionId: 'boss_smoke_bomb', targetMode: 'aoe' };
    case 'treant':
      return { actionId: 'boss_root', targetMode: 'single_target' };
    case 'spirit':
    case 'caster':
      return { actionId: 'boss_weaken', targetMode: 'aoe' };
    case 'undead':
      return { actionId: 'boss_wither', targetMode: 'single_target' };
    case 'default':
    default:
      return damageType === 'magic'
        ? { actionId: 'boss_weaken', targetMode: 'aoe' }
        : { actionId: 'boss_enrage', targetMode: 'single_target' };
  }
}

function resolveMiniBossSpecial(theme: FamilyTheme, damageType: DamageType): BossTemplateAction {
  switch (theme) {
    case 'spider':
      return { actionId: 'boss_venom_cloud', targetMode: 'aoe' };
    case 'wolf':
      return { actionId: 'boss_terrifying_howl', targetMode: 'aoe' };
    case 'bandit':
      return { actionId: 'boss_mark_for_death', targetMode: 'single_target' };
    case 'treant':
      return { actionId: 'boss_shield_wall', targetMode: 'single_target' };
    case 'spirit':
    case 'caster':
      return { actionId: 'boss_weaken', targetMode: 'aoe' };
    case 'undead':
      return { actionId: 'boss_blight_cloud', targetMode: 'aoe' };
    case 'default':
    default:
      return damageType === 'magic'
        ? { actionId: 'boss_weaken', targetMode: 'aoe' }
        : { actionId: 'boss_enrage', targetMode: 'single_target' };
  }
}
