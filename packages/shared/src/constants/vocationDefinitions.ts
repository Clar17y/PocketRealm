import type { CombatActionType } from '../types/combatAction.types';
import type { ItemType } from '../types/item.types';
import type { EquipmentSlot, SkillType } from '../types/player.types';
import type {
  CraftMarkDefinition,
  EquipmentActionModifier,
  EquipmentActionModifierStat,
  ItemStatModifier,
  VocationBranchId,
  VocationDefinition,
  VocationId,
  VocationTechniqueDefinition,
  VocationTechniqueEffect,
} from '../types/vocation.types';

export const VOCATION_IDS = [
  'prospector',
  'forester',
  'herbalist',
  'weaponsmith',
  'bowyer',
  'staffwright',
  'armorer',
  'leatherworker',
  'tailor',
  'jeweller',
  'alchemist',
] as const satisfies readonly VocationId[];

const FORGE_WEAPON_SLOTS = ['main_hand'] as const;
const ARMOR_SLOTS = ['head', 'chest', 'gloves', 'legs', 'boots'] as const;
const LIGHT_ARMOR_SLOTS = ['chest', 'gloves', 'legs', 'boots'] as const;
const JEWELLERY_SLOTS = ['neck', 'ring', 'charm'] as const;
const ATTACK_ACTIONS = ['light_attack', 'normal_attack', 'heavy_attack', 'skill_attack'] as const;

export const VOCATION_DEFINITIONS = [
  vocation('prospector', 'Prospector', 'Reads stone, splits ore, and coaxes gems from stubborn seams.', 'millbrook', 'mining', [
    branch('prospector_veinreader', 'Veinreader', 'Ore finding, clean breaks, and safer deep cuts.'),
    branch('prospector_gemcutter', 'Gemcutter', 'Gem recovery, facet preparation, and rare inclusions.'),
  ], [
    gatherTech('prospector_clean_split', 'prospector', 'prospector_veinreader', 'Clean Split', 'Strike ore along the grain for more usable chunks.', 1, 1, 'mining', ['ore'], amount(0.06)),
    gatherTech('prospector_deep_vein_sense', 'prospector', 'prospector_veinreader', 'Deep Vein Sense', 'Spot darker mineral lines before the first blow.', 3, 1, 'mining', ['ore'], discovery(0.05)),
    gatherTech('prospector_quiet_pick', 'prospector', 'prospector_veinreader', 'Quiet Pick', 'Set the pick without wasting motion or shattering stone.', 5, 2, 'mining', ['ore'], gatherTurns(0.04)),
    gatherTech('prospector_bright_inclusion', 'prospector', 'prospector_gemcutter', 'Bright Inclusion', 'Preserve promising crystal pockets while mining.', 2, 1, 'mining', ['gem'], rareFind('gem_crit', 0.04)),
    gatherTech('prospector_lantern_glint', 'prospector', 'prospector_gemcutter', 'Lantern Glint', 'Angle lamplight to reveal gem-bearing fractures.', 6, 2, 'mining', ['gem'], rareFind('gem_crit', 0.07)),
    gatherTech('prospector_tool_sparing_survey', 'prospector', 'prospector_gemcutter', 'Tool-Sparing Survey', 'Map the next strike so matching picks lose less edge on stone.', 8, 2, 'mining', ['ore', 'gem'], toolDurabilitySaver(0.15)),
  ]),
  vocation('forester', 'Forester', 'Selects living timber, harvests clean planks, and gathers woodland resins.', 'millbrook', 'woodcutting', [
    branch('forester_timberwright', 'Timberwright', 'Strong cuts, straight grain, and better bow staves.'),
    branch('forester_resinseer', 'Resinseer', 'Sap, resin, and hidden grove harvests.'),
  ], [
    gatherTech('forester_grain_call', 'forester', 'forester_timberwright', 'Grain Call', 'Read the tree rings before the axe falls.', 1, 1, 'woodcutting', ['wood'], amount(0.06)),
    gatherTech('forester_split_wedge', 'forester', 'forester_timberwright', 'Split Wedge', 'Open trunks into straighter plank stock.', 3, 1, 'woodcutting', ['wood'], gatherTurns(0.04)),
    gatherTech('forester_heartwood_choice', 'forester', 'forester_timberwright', 'Heartwood Choice', 'Favor dense heartwood suitable for weapon limbs.', 6, 2, 'woodcutting', ['wood'], rareFind('heartwood', 0.05)),
    gatherTech('forester_sap_listening', 'forester', 'forester_resinseer', 'Sap Listening', 'Hear resin-rich bark before cutting.', 2, 1, 'woodcutting', ['resin'], discovery(0.04)),
    gatherTech('forester_oiled_axe_head', 'forester', 'forester_resinseer', 'Oiled Axe Head', 'Keep matching axes clean enough to spare their bite through resin work.', 5, 2, 'woodcutting', ['wood', 'resin'], toolDurabilitySaver(0.15)),
    gatherTech('forester_bark_bowl', 'forester', 'forester_resinseer', 'Bark Bowl', 'Catch every drop of workable pitch.', 8, 2, 'woodcutting', ['resin'], amount(0.08)),
  ]),
  vocation('herbalist', 'Herbalist', 'Harvests herbs without bruising their virtues and preserves living seed.', 'millbrook', 'foraging', [
    branch('herbalist_leafwarden', 'Leafwarden', 'Clean leaf harvests and rare medicinal finds.'),
    branch('herbalist_seedbinder', 'Seedbinder', 'Seed care, regrowth, and patient cultivation.'),
  ], [
    gatherTech('herbalist_dawn_pinch', 'herbalist', 'herbalist_leafwarden', 'Dawn Pinch', 'Pinch stems when oils are strongest.', 1, 1, 'foraging', ['herb'], amount(0.06)),
    gatherTech('herbalist_unbruised_leaf', 'herbalist', 'herbalist_leafwarden', 'Unbruised Leaf', 'Keep delicate leaves intact for stronger mixtures.', 3, 1, 'foraging', ['herb'], rareFind('rare_botanical', 0.04)),
    gatherTech('herbalist_shadow_basket', 'herbalist', 'herbalist_leafwarden', 'Shadow Basket', 'Pack herbs in shade to save wasted trips.', 5, 2, 'foraging', ['herb'], gatherTurns(0.04)),
    gatherTech('herbalist_seed_whisper', 'herbalist', 'herbalist_seedbinder', 'Seed Whisper', 'Find seed heads other gatherers overlook.', 2, 1, 'foraging', ['seed'], discovery(0.05)),
    gatherTech('herbalist_root_patience', 'herbalist', 'herbalist_seedbinder', 'Root Patience', 'Lift roots whole and leave the bed alive.', 6, 2, 'foraging', ['root', 'herb'], amount(0.08)),
    gatherTech('herbalist_soft_grip_knife', 'herbalist', 'herbalist_seedbinder', 'Soft-Grip Knife', 'Cut with a matched knife grip that protects both tool edge and root bed.', 8, 2, 'foraging', ['herb', 'seed'], toolDurabilitySaver(0.15)),
  ]),
  vocation('weaponsmith', 'Weaponsmith', 'Forges blades and striking heads that hold an edge under real pressure.', 'thornwall', 'weaponsmithing', [
    branch('weaponsmith_blades', 'Blades', 'Edges, balance, and quick killing lines.'),
    branch('weaponsmith_hammers', 'Hammers', 'Mass, impact, and battlefield staying power.'),
  ], [
    craftTech('weaponsmith_keen_edge', 'weaponsmith', 'weaponsmith_blades', 'Keen Edge', 'Draw a harder bevel onto forged blades.', 1, 1, 'weaponsmithing', ['weapon'], FORGE_WEAPON_SLOTS, craftStat('attack', 0.04)),
    craftTech('weaponsmith_tempered_spine', 'weaponsmith', 'weaponsmith_blades', 'Tempered Spine', 'Leave the back of a blade springy enough to survive bad parries.', 3, 1, 'weaponsmithing', ['weapon'], FORGE_WEAPON_SLOTS, durability(0.08)),
    craftTech('weaponsmith_blood_groove', 'weaponsmith', 'weaponsmith_blades', 'Blood Groove', 'Cut weight without losing the line of force.', 6, 2, 'weaponsmithing', ['weapon'], FORGE_WEAPON_SLOTS, mark('blood_groove_mark', 'Blood Groove Mark', 'A forged groove that favors decisive melee hits while making the edge harder to maintain.', ['weapon'], FORGE_WEAPON_SLOTS, [{ stat: 'attack', value: 0.05, isPercent: true }], [{ stat: 'critDamage', value: -0.02, isPercent: true }], [
      highWearMarkActionMod('weaponsmith_blood_groove_heavy_tradeoff', FORGE_WEAPON_SLOTS, ['heavy_attack', 'skill_attack'], 'damage', 0.05, 0.08),
    ])),
    craftTech('weaponsmith_anvil_rebound', 'weaponsmith', 'weaponsmith_hammers', 'Anvil Rebound', 'Use hammer rebound to shape heavier heads cleanly.', 2, 1, 'weaponsmithing', ['weapon'], FORGE_WEAPON_SLOTS, craftTurns(0.04)),
    actionTech('weaponsmith_crushing_poll', 'weaponsmith', 'weaponsmith_hammers', 'Crushing Poll', 'Balance blunt heads for stronger heavy blows.', 5, 2, FORGE_WEAPON_SLOTS, ['heavy_attack'], actionMod('weaponsmith_crushing_poll_force', FORGE_WEAPON_SLOTS, ['heavy_attack'], 'damage', 0.05)),
    craftTech('weaponsmith_quench_batch', 'weaponsmith', 'weaponsmith_hammers', 'Quench Batch', 'Plan repeated quenches so one extra head can be finished from a larger heat.', 8, 2, 'weaponsmithing', ['weapon'], FORGE_WEAPON_SLOTS, batchOutputTradeoff(0.2)),
  ]),
  vocation('bowyer', 'Bowyer', 'Shapes bows, strings, and ranged fittings for steady power at distance.', 'millbrook', 'woodcutting', [
    branch('bowyer_stringcraft', 'Stringcraft', 'Tension, release, and cleaner ranged shots.'),
    branch('bowyer_limbcraft', 'Limbcraft', 'Balanced limbs and resilient bow bodies.'),
  ], [
    craftTech('bowyer_tight_string', 'bowyer', 'bowyer_stringcraft', 'Tight String', 'Twist a string that returns power without drifting.', 1, 1, 'weaponsmithing', ['weapon'], FORGE_WEAPON_SLOTS, tightStringMark()),
    actionTech('bowyer_silent_release', 'bowyer', 'bowyer_stringcraft', 'Silent Release', 'Tune the string for cleaner opening shots.', 3, 1, FORGE_WEAPON_SLOTS, ['light_attack', 'normal_attack'], actionMod('bowyer_silent_release_accuracy', FORGE_WEAPON_SLOTS, ['light_attack', 'normal_attack'], 'accuracy', 0.04)),
    craftTech('bowyer_waxed_loop', 'bowyer', 'bowyer_stringcraft', 'Waxed Loop', 'Protect loops from fraying under hard draws.', 5, 2, 'weaponsmithing', ['weapon'], FORGE_WEAPON_SLOTS, durability(0.08)),
    craftTech('bowyer_even_limb', 'bowyer', 'bowyer_limbcraft', 'Even Limb', 'Tillering makes both limbs carry equal stress.', 2, 1, 'weaponsmithing', ['weapon'], FORGE_WEAPON_SLOTS, craftStat('accuracy', 0.03)),
    craftTech('bowyer_horn_nock', 'bowyer', 'bowyer_limbcraft', 'Horn Nock', 'Seat horn tips that hold rare strings true.', 6, 2, 'weaponsmithing', ['weapon'], FORGE_WEAPON_SLOTS, rarity('uncommon', 0.04)),
    craftTech('bowyer_seasoned_batch', 'bowyer', 'bowyer_limbcraft', 'Seasoned Batch', 'Group seasoned staves so a larger glue-up can finish one extra bow body.', 8, 2, 'weaponsmithing', ['weapon'], FORGE_WEAPON_SLOTS, batchOutputTradeoff(0.2)),
  ]),
  vocation('staffwright', 'Staffwright', 'Carves channels and focus seats for tools of disciplined magic.', 'thornwall', 'magic', [
    branch('staffwright_channels', 'Channels', 'Mana paths, spell force, and cleaner conduits.'),
    branch('staffwright_focuses', 'Focuses', 'Focus gems, wards, and supportive casting.'),
  ], [
    craftTech('staffwright_wide_channel', 'staffwright', 'staffwright_channels', 'Wide Channel', 'Open a broader mana path through the staff core.', 1, 1, 'weaponsmithing', ['weapon'], FORGE_WEAPON_SLOTS, craftStat('magicPower', 0.04)),
    actionTech('staffwright_runed_grip', 'staffwright', 'staffwright_channels', 'Runed Grip', 'Keep spellwork steady during hostile motion.', 3, 1, FORGE_WEAPON_SLOTS, ['damage_spell', 'debuff_spell'], actionMod('staffwright_runed_grip_accuracy', FORGE_WEAPON_SLOTS, ['damage_spell', 'debuff_spell'], 'accuracy', 0.04)),
    craftTech('staffwright_silver_inlay', 'staffwright', 'staffwright_channels', 'Silver Inlay', 'Lay silver into the channel to hold stronger charge.', 6, 2, 'weaponsmithing', ['weapon'], FORGE_WEAPON_SLOTS, mark('silver_inlay_mark', 'Silver Inlay Mark', 'A bright channel mark that favors magic power while pulling power away from mundane accuracy.', ['weapon'], FORGE_WEAPON_SLOTS, [{ stat: 'magicPower', value: 0.05, isPercent: true }], [{ stat: 'accuracy', value: -0.02, isPercent: true }], [
      highWearMarkActionMod('staffwright_silver_inlay_spell_charge', FORGE_WEAPON_SLOTS, ['damage_spell'], 'damage', 0.05, 0.08),
    ])),
    craftTech('staffwright_clear_focus', 'staffwright', 'staffwright_focuses', 'Clear Focus', 'Seat a focus without clouding its center.', 2, 1, 'jewelcrafting', ['weapon'], FORGE_WEAPON_SLOTS, rarity('uncommon', 0.04)),
    actionTech('staffwright_ward_knot', 'staffwright', 'staffwright_focuses', 'Ward Knot', 'Tie focus cords to answer defensive casting.', 5, 2, FORGE_WEAPON_SLOTS, ['ward', 'buff'], actionMod('staffwright_ward_knot_defence', FORGE_WEAPON_SLOTS, ['ward', 'buff'], 'defence', 0.05)),
    craftTech('staffwright_channel_batch', 'staffwright', 'staffwright_focuses', 'Channel Batch', 'Cut repeated channel blanks from a larger prepared bundle.', 8, 2, 'weaponsmithing', ['weapon'], FORGE_WEAPON_SLOTS, batchOutputTradeoff(0.2)),
  ]),
  vocation('armorer', 'Armorer', 'Raises plates and links that keep shape when the line breaks.', 'thornwall', 'armorsmithing', [
    branch('armorer_plate', 'Plate', 'Heavy protection, dents, and shielded stance.'),
    branch('armorer_mail', 'Mail', 'Flexible links, coverage, and lighter movement.'),
  ], [
    craftTech('armorer_heavy_plate', 'armorer', 'armorer_plate', 'Heavy Plate', 'Raise thicker plates without dead weight.', 1, 1, 'armorsmithing', ['armor'], ARMOR_SLOTS, craftStat('armor', 0.04)),
    actionTech('armorer_locked_cuirass', 'armorer', 'armorer_plate', 'Locked Cuirass', 'Shape breastplates that hold under a full guard.', 3, 1, ['chest'], ['defend'], actionMod('armorer_locked_cuirass_defence', ['chest'], ['defend'], 'defence', 0.05)),
    craftTech('armorer_bossed_rivet', 'armorer', 'armorer_plate', 'Bossed Rivet', 'Seat rivets that spread impact instead of tearing free.', 6, 2, 'armorsmithing', ['armor'], ARMOR_SLOTS, durability(0.08)),
    craftTech('armorer_supple_mail', 'armorer', 'armorer_mail', 'Supple Mail', 'Close rings so they slide instead of snagging.', 2, 1, 'armorsmithing', ['armor'], ARMOR_SLOTS, craftStat('dodge', 0.03)),
    actionTech('armorer_counter_links', 'armorer', 'armorer_mail', 'Counter Links', 'Leave enough give for a quick riposte.', 5, 2, ARMOR_SLOTS, ['counter'], actionMod('armorer_counter_links_damage', ARMOR_SLOTS, ['counter'], 'damage', 0.05)),
    craftTech('armorer_ring_batch', 'armorer', 'armorer_mail', 'Ring Batch', 'Cut and close extra mail rings from a larger prepared coil.', 8, 2, 'armorsmithing', ['armor'], ARMOR_SLOTS, batchOutputTradeoff(0.2)),
  ]),
  vocation('leatherworker', 'Leatherworker', 'Cures hides and stitching for flexible gear that survives rough travel.', 'millbrook', 'leatherworking', [
    branch('leatherworker_hides', 'Hides', 'Curing, toughness, and resilient panels.'),
    branch('leatherworker_stitching', 'Stitching', 'Seams, straps, and agile fit.'),
  ], [
    craftTech('leatherworker_oil_cure', 'leatherworker', 'leatherworker_hides', 'Oil Cure', 'Work oil deep enough to keep leather alive.', 1, 1, 'leatherworking', ['armor'], LIGHT_ARMOR_SLOTS, craftStat('armor', 0.03)),
    craftTech('leatherworker_grain_side', 'leatherworker', 'leatherworker_hides', 'Grain Side', 'Cut panels with the grain facing the stress.', 3, 1, 'leatherworking', ['armor'], LIGHT_ARMOR_SLOTS, durability(0.08)),
    craftTech('leatherworker_smoke_tan', 'leatherworker', 'leatherworker_hides', 'Smoke Tan', 'Finish hides that resist swamp rot and road dust.', 6, 2, 'leatherworking', ['armor'], LIGHT_ARMOR_SLOTS, rarity('uncommon', 0.04)),
    craftTech('leatherworker_hidden_stitch', 'leatherworker', 'leatherworker_stitching', 'Hidden Stitch', 'Run seams where blades cannot easily catch them.', 2, 1, 'leatherworking', ['armor'], LIGHT_ARMOR_SLOTS, craftStat('dodge', 0.03)),
    actionTech('leatherworker_quick_strap', 'leatherworker', 'leatherworker_stitching', 'Quick Strap', 'Set straps that move cleanly through counters.', 5, 2, LIGHT_ARMOR_SLOTS, ['counter', 'defend'], actionMod('leatherworker_quick_strap_dodge', LIGHT_ARMOR_SLOTS, ['counter', 'defend'], 'dodge', 0.04)),
    craftTech('leatherworker_nested_pattern', 'leatherworker', 'leatherworker_stitching', 'Nested Pattern', 'Lay out a larger hide cut to finish one extra matching panel.', 8, 2, 'leatherworking', ['armor'], LIGHT_ARMOR_SLOTS, batchOutputTradeoff(0.2)),
  ]),
  vocation('tailor', 'Tailor', 'Weaves cloth gear, warding threads, and precise utility garments.', 'millbrook', 'tailoring', [
    branch('tailor_weaves', 'Weaves', 'Cloth structure, fit, and durable seams.'),
    branch('tailor_enchantments', 'Enchantments', 'Ward threads and spell-friendly lining.'),
  ], [
    craftTech('tailor_crossgrain_cut', 'tailor', 'tailor_weaves', 'Crossgrain Cut', 'Cut cloth so it hangs and moves cleanly.', 1, 1, 'tailoring', ['armor'], LIGHT_ARMOR_SLOTS, craftStat('dodge', 0.03)),
    craftTech('tailor_reinforced_hem', 'tailor', 'tailor_weaves', 'Reinforced Hem', 'Fold hems that resist tearing under travel wear.', 3, 1, 'tailoring', ['armor'], LIGHT_ARMOR_SLOTS, durability(0.08)),
    craftTech('tailor_pocket_layout', 'tailor', 'tailor_weaves', 'Pocket Layout', 'Place pockets and ties where hands naturally find them.', 6, 2, 'tailoring', ['armor'], ['chest', 'belt'], craftStat('luck', 0.03)),
    craftTech('tailor_ward_weave', 'tailor', 'tailor_enchantments', 'Ward Weave', 'Carry warding thread through the whole garment.', 2, 1, 'tailoring', ['armor'], LIGHT_ARMOR_SLOTS, craftStat('magicDefence', 0.04)),
    actionTech('tailor_spell_lining', 'tailor', 'tailor_enchantments', 'Spell Lining', 'Line robes to steady restorative gestures.', 5, 2, LIGHT_ARMOR_SLOTS, ['heal_self', 'heal_ally', 'buff'], actionMod('tailor_spell_lining_healing', LIGHT_ARMOR_SLOTS, ['heal_self', 'heal_ally', 'buff'], 'healing', 0.04)),
    craftTech('tailor_bolted_pattern', 'tailor', 'tailor_enchantments', 'Bolted Pattern', 'Cut repeated panels from a larger bolt to finish an extra garment piece.', 8, 2, 'tailoring', ['armor'], LIGHT_ARMOR_SLOTS, batchOutputTradeoff(0.2)),
  ]),
  vocation('jeweller', 'Jeweller', 'Cuts gems and settings that sharpen luck, focus, and combat precision.', 'thornwall', 'jewelcrafting', [
    branch('jeweller_facets', 'Facets', 'Cut gems, sharp angles, and clear light.'),
    branch('jeweller_settings', 'Settings', 'Prongs, bands, and battle-ready mounting.'),
  ], [
    craftTech('jeweller_sharp_facets', 'jeweller', 'jeweller_facets', 'Sharp Facets', 'Cut facets that catch the exact needed light.', 1, 1, 'jewelcrafting', ['armor'], JEWELLERY_SLOTS, craftStat('critChance', 0.02)),
    craftTech('jeweller_clear_table', 'jeweller', 'jeweller_facets', 'Clear Table', 'Polish the table until flaws stop scattering force.', 3, 1, 'jewelcrafting', ['armor'], JEWELLERY_SLOTS, craftStat('luck', 0.04)),
    craftTech('jeweller_star_cut', 'jeweller', 'jeweller_facets', 'Star Cut', 'Find the star inside rare stones before it breaks.', 6, 2, 'jewelcrafting', ['armor'], JEWELLERY_SLOTS, rarity('rare', 0.02)),
    craftTech('jeweller_claw_setting', 'jeweller', 'jeweller_settings', 'Claw Setting', 'Bend prongs tight without shadowing the gem.', 2, 1, 'jewelcrafting', ['armor'], JEWELLERY_SLOTS, durability(0.08)),
    actionTech('jeweller_true_sight_band', 'jeweller', 'jeweller_settings', 'True Sight Band', 'Set rings that steady attacks at the last instant.', 5, 2, ['ring'], ATTACK_ACTIONS, actionMod('jeweller_true_sight_band_accuracy', ['ring'], ATTACK_ACTIONS, 'accuracy', 0.04)),
    craftTech('jeweller_wax_tree', 'jeweller', 'jeweller_settings', 'Wax Tree', 'Cast repeated settings from a larger wax tree to finish one extra mount.', 8, 2, 'jewelcrafting', ['armor'], JEWELLERY_SLOTS, batchOutputTradeoff(0.2)),
  ]),
  vocation('alchemist', 'Alchemist', 'Distills herbs, minerals, and monster reagents into reliable mixtures.', 'thornwall', 'alchemy', [
    branch('alchemist_extracts', 'Extracts', 'Potent bases, strong pulls, and preserved reagents.'),
    branch('alchemist_distillations', 'Distillations', 'Clean reductions, stable mixtures, and battlefield use.'),
  ], [
    craftTech('alchemist_strong_extract', 'alchemist', 'alchemist_extracts', 'Strong Extract', 'Pull the whole virtue from the reagent.', 1, 1, 'alchemy', ['consumable'], undefined, craftStat('luck', 0.03)),
    craftTech('alchemist_cold_maceration', 'alchemist', 'alchemist_extracts', 'Cold Maceration', 'Let fragile herbs release strength without heat.', 3, 1, 'alchemy', ['consumable'], undefined, rarity('uncommon', 0.04)),
    craftTech('alchemist_mortar_rhythm', 'alchemist', 'alchemist_extracts', 'Mortar Rhythm', 'Grind until texture reveals the next step.', 6, 2, 'alchemy', ['consumable'], undefined, craftTurns(0.04)),
    craftTech('alchemist_clear_distillate', 'alchemist', 'alchemist_distillations', 'Clear Distillate', 'Cut away clouded fractions for stable potions.', 2, 1, 'alchemy', ['consumable'], undefined, durability(0.08)),
    actionTech('alchemist_fast_stopple', 'alchemist', 'alchemist_distillations', 'Fast Stopple', 'Bottle mixtures for quicker field use.', 5, 2, ['belt'], ['use_potion', 'use_cleanse_potion', 'use_buff_potion'], actionMod('alchemist_fast_stopple_cost', ['belt'], ['use_potion', 'use_cleanse_potion', 'use_buff_potion'], 'resourceCost', -0.05)),
    craftTech('alchemist_scaled_retort', 'alchemist', 'alchemist_distillations', 'Scaled Retort', 'Run a larger retort charge to bottle one extra dose from extra reagent mass.', 8, 2, 'alchemy', ['consumable'], undefined, batchOutputTradeoff(0.2)),
  ]),
] as const satisfies readonly VocationDefinition[];

export function getVocationDefinition(vocationId: VocationId): VocationDefinition | undefined {
  return VOCATION_DEFINITIONS.find((definition) => definition.id === vocationId);
}

export function getTechniqueDefinition(techniqueId: string): VocationTechniqueDefinition | undefined {
  for (const vocation of VOCATION_DEFINITIONS) {
    const technique = vocation.techniques.find((candidate) => candidate.id === techniqueId);
    if (technique) {
      return technique;
    }
  }

  return undefined;
}

export function assertValidVocationDefinitions(): void {
  const techniqueIds = new Set<string>();

  for (const vocationId of VOCATION_IDS) {
    const vocation = getVocationDefinition(vocationId);
    if (!vocation) {
      throw new Error(`Missing vocation definition: ${vocationId}`);
    }
    if (vocation.branches.length < 2) {
      throw new Error(`${vocation.id} must have at least two branches`);
    }
    if (vocation.techniques.length < 6) {
      throw new Error(`${vocation.id} must have at least six techniques`);
    }

    const branchIds = new Set(vocation.branches.map((branchDefinition) => branchDefinition.id));
    for (const technique of vocation.techniques) {
      if (technique.vocationId !== vocation.id) {
        throw new Error(`${technique.id} must belong to ${vocation.id}`);
      }
      if (!branchIds.has(technique.branchId)) {
        throw new Error(`${technique.id} references an unknown branch`);
      }
      if (techniqueIds.has(technique.id)) {
        throw new Error(`Duplicate vocation technique id: ${technique.id}`);
      }
      if (technique.requiredRank < 1 || technique.pointCost < 1 || technique.effects.length === 0) {
        throw new Error(`${technique.id} must define rank, point cost, and effects`);
      }

      techniqueIds.add(technique.id);
    }
  }
}

function vocation(
  id: VocationId,
  name: string,
  description: string,
  mentorTown: VocationDefinition['mentorTown'],
  primarySkill: SkillType,
  branches: VocationDefinition['branches'],
  techniques: VocationDefinition['techniques'],
): VocationDefinition {
  return { id, name, description, mentorTown, primarySkill, branches, techniques };
}

function branch(id: VocationBranchId, name: string, description: string): VocationDefinition['branches'][number] {
  return { id, name, description };
}

function gatherTech(
  id: string,
  vocationId: VocationId,
  branchId: VocationBranchId,
  name: string,
  description: string,
  requiredRank: number,
  pointCost: number,
  skill: SkillType,
  resourceCategories: readonly string[],
  effect: VocationTechniqueEffect,
): VocationTechniqueDefinition {
  return {
    id,
    vocationId,
    branchId,
    name,
    description,
    requiredRank,
    pointCost,
    applicationRule: { type: 'gathering', skill, resourceCategories },
    effects: [effect],
  };
}

function craftTech(
  id: string,
  vocationId: VocationId,
  branchId: VocationBranchId,
  name: string,
  description: string,
  requiredRank: number,
  pointCost: number,
  skill: SkillType,
  itemTypes: readonly ItemType[],
  equipmentSlots: readonly EquipmentSlot[] | undefined,
  effect: VocationTechniqueEffect,
): VocationTechniqueDefinition {
  return {
    id,
    vocationId,
    branchId,
    name,
    description,
    requiredRank,
    pointCost,
    applicationRule: equipmentSlots
      ? { type: 'craft', skill, itemTypes, equipmentSlots }
      : { type: 'craft', skill, itemTypes },
    effects: [withTechniqueMarkScope(id, effect, itemTypes, equipmentSlots)],
  };
}

function actionTech(
  id: string,
  vocationId: VocationId,
  branchId: VocationBranchId,
  name: string,
  description: string,
  requiredRank: number,
  pointCost: number,
  equipmentSlots: readonly EquipmentSlot[],
  actionTypes: readonly CombatActionType[],
  effect: VocationTechniqueEffect,
): VocationTechniqueDefinition {
  return {
    id,
    vocationId,
    branchId,
    name,
    description,
    requiredRank,
    pointCost,
    applicationRule: { type: 'equipment_action', equipmentSlots, actionTypes },
    effects: [effect],
  };
}

function craftStat(
  stat: ItemStatModifier['stat'],
  value: number,
): VocationTechniqueEffect {
  return mark(
    'tempered_signature',
    'Tempered Signature',
    'A visible maker mark that improves one item property by accepting a linked drawback.',
    [],
    undefined,
    [{ stat, value, isPercent: true }],
    [pairedDrawback(stat)],
  );
}

function durability(value: number): VocationTechniqueEffect {
  return {
    type: 'craft_flow_modifier',
    ruleId: 'overbuilt_finish',
    condition: 'Apply only when the craft consumes at least one reinforcing material.',
    materialCostMultiplier: 1 + value,
    drawback: 'The sturdier finish costs extra reinforcing material instead of being a free durability bump.',
  };
}

function rarity(rarityValue: 'uncommon' | 'rare' | 'epic' | 'legendary', value: number): VocationTechniqueEffect {
  return {
    type: 'craft_crit_rule',
    ruleId: `${rarityValue}_finish_window`,
    critType: 'rarity_upgrade',
    critChanceDelta: value,
    condition: `Only applies to crafts whose normal crit result can reach ${rarityValue}.`,
    drawback: 'Failed upgraded finishes add 5% material waste to that craft.',
  };
}

function craftTurns(value: number): VocationTechniqueEffect {
  return {
    type: 'craft_flow_modifier',
    ruleId: 'rushed_bench_sequence',
    condition: 'Only applies when repeating the same recipe in the same crafting batch.',
    turnCostMultiplier: 1 - value,
    materialCostMultiplier: 1.03,
    drawback: 'The faster bench sequence raises material cost through extra trimming and rejected fits.',
  };
}

function batchOutputTradeoff(value: number): VocationTechniqueEffect {
  return {
    type: 'craft_flow_modifier',
    ruleId: 'journaled_batch_setup',
    condition: 'Only applies to batches of at least five identical recipes.',
    outputQuantityDelta: 1,
    materialCostMultiplier: 1 + value,
    drawback: 'The extra output comes from planned batch setup and requires additional input material.',
  };
}

function mark(
  id: string,
  name: string,
  description: string,
  allowedItemTypes: CraftMarkDefinition['allowedItemTypes'],
  allowedSlots: readonly EquipmentSlot[] | undefined,
  itemStatBenefits: readonly ItemStatModifier[] = [],
  itemStatDrawbacks: readonly ItemStatModifier[] = [],
  actionModifiers: readonly EquipmentActionModifier[] = [],
): VocationTechniqueEffect {
  return {
    type: 'craft_mark',
    mark: {
      markId: id,
      name,
      description,
      allowedItemTypes,
      allowedSlots,
      itemStatBenefits,
      itemStatDrawbacks,
      actionModifiers,
    },
  };
}

function tightStringMark(): VocationTechniqueEffect {
  return mark(
    'tight_string_mark',
    'Tight String Mark',
    'A taut string mark that pushes simple shots harder while wearing the bow faster under repeated draw.',
    ['weapon'],
    FORGE_WEAPON_SLOTS,
    [{ stat: 'rangedPower', value: 0.04, isPercent: true }],
    [{ stat: 'accuracy', value: -0.02, isPercent: true }],
    [
      highWearMarkActionMod(
        'bowyer_tight_string_snap_tradeoff',
        FORGE_WEAPON_SLOTS,
        ['light_attack', 'normal_attack', 'skill_attack'],
        'damage',
        0.04,
        0.08,
      ),
    ],
  );
}

function amount(value: number): VocationTechniqueEffect {
  return {
    type: 'inventory_pressure_yield_rule',
    minFreeSlots: 3,
    outputQuantityDelta: value > 0.07 ? 2 : 1,
    overflowBehavior: 'skip_bonus',
  };
}

function rareFind(critType: 'gem_crit' | 'rare_botanical' | 'resin_pocket' | 'heartwood', value: number): VocationTechniqueEffect {
  return {
    type: 'crit_chance_delta',
    critType,
    value,
    condition: 'Only applies to resource nodes that already support the matching resource-specific critical result.',
  };
}

function gatherTurns(value: number): VocationTechniqueEffect {
  return {
    type: 'repeat_node_turn_discount',
    repeatWindowTurns: 300,
    turnCostMultiplier: 1 - value,
    maxStacks: 2,
  };
}

function discovery(value: number): VocationTechniqueEffect {
  return {
    type: 'preserve_node_capacity_chance',
    chance: value,
    condition: 'Only rolls when gathering from a fresh node without exhausting its final capacity.',
  };
}

function toolDurabilitySaver(value: number): VocationTechniqueEffect {
  return {
    type: 'tool_durability_loss_multiplier',
    multiplier: 1 - value,
    condition: 'Only applies when the equipped tool matches the gathered resource category.',
  };
}

function actionMod(
  modifierId: string,
  equipmentSlots: readonly EquipmentSlot[],
  actionTypes: readonly CombatActionType[],
  stat: EquipmentActionModifierStat,
  value: number,
): VocationTechniqueEffect {
  return {
    type: 'equipment_action_modifier',
    ...markActionMod(modifierId, equipmentSlots, actionTypes, stat, value),
  };
}

function markActionMod(
  modifierId: string,
  equipmentSlots: readonly EquipmentSlot[],
  actionTypes: readonly CombatActionType[],
  stat: EquipmentActionModifierStat,
  value: number,
): EquipmentActionModifier {
  return {
    modifierId,
    equipmentSlots,
    actionTypes,
    benefits: [{ stat, value, isPercent: true }],
    drawbacks: [actionDrawbackFor(stat)],
  };
}

function highWearMarkActionMod(
  modifierId: string,
  equipmentSlots: readonly EquipmentSlot[],
  actionTypes: readonly CombatActionType[],
  stat: EquipmentActionModifierStat,
  value: number,
  wearValue: number,
): EquipmentActionModifier {
  return {
    modifierId,
    equipmentSlots,
    actionTypes,
    benefits: [{ stat, value, isPercent: true }],
    drawbacks: [{ stat: 'durabilityWear', value: wearValue, isPercent: true }],
  };
}

function withTechniqueMarkScope(
  techniqueId: string,
  effect: VocationTechniqueEffect,
  allowedItemTypes: readonly ItemType[],
  allowedSlots: readonly EquipmentSlot[] | undefined,
): VocationTechniqueEffect {
  if (effect.type !== 'craft_mark') {
    return effect;
  }

  return {
    ...effect,
    mark: {
      ...effect.mark,
      allowedItemTypes,
      allowedSlots,
      markId: effect.mark.markId.startsWith(`${techniqueId}_`)
        ? effect.mark.markId
        : `${techniqueId}_${effect.mark.markId}`,
    },
  };
}

function pairedDrawback(stat: ItemStatModifier['stat']): ItemStatModifier {
  if (stat === 'dodge') {
    return { stat: 'armor', value: -0.02, isPercent: true };
  }
  if (stat === 'armor' || stat === 'magicDefence' || stat === 'health') {
    return { stat: 'dodge', value: -0.02, isPercent: true };
  }
  if (stat === 'accuracy') {
    return { stat: 'critDamage', value: -0.02, isPercent: true };
  }

  return { stat: 'dodge', value: -0.02, isPercent: true };
}

function actionDrawbackFor(stat: EquipmentActionModifierStat): { stat: EquipmentActionModifierStat; value: number; isPercent: boolean } {
  if (stat === 'resourceCost') {
    return { stat: 'durabilityWear', value: 0.04, isPercent: true };
  }
  if (stat === 'defence' || stat === 'dodge') {
    return { stat: 'damage', value: -0.03, isPercent: true };
  }
  if (stat === 'healing') {
    return { stat: 'resourceCost', value: 0.04, isPercent: true };
  }

  return { stat: 'resourceCost', value: 0.04, isPercent: true };
}
