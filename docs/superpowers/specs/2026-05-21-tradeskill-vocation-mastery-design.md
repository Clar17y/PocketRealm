# Tradeskill Vocation Mastery Design

## Context

The talent tree rebalance removed non-combat crafting and gathering nodes such as Efficient Mining, Cheaper Repairs, Salvage Expert, Master Crafter, and Grandmaster from the combat/survival talent system. The replacement should not be a generic set of percentage perks bolted onto existing skills. It should become a native profession system that uses Pocketrealm's turn economy, towns, mentors, achievements, titles, crafted item identity, and seasonal pressure.

This design replaces the exploratory generic honing implementation with a dedicated Vocation Mastery System.

## Goals

- Make tradeskill progression feel like a real part of the RPG world, not an addon menu.
- Let permanent-realm characters eventually become broadly accomplished, while seasonal characters must specialize through a limited daily active honing budget.
- Preserve existing skill XP, recipe requirements, action requirements, talent trees, and equipment gates.
- Give crafters and gatherers named identities, techniques, achievements, titles, and visible outputs.
- Make mastery unlock useful capabilities, especially item and gathering techniques, rather than only flat `+x%` modifiers.
- Support craft marks that create gear for specific combat playstyles without bypassing combat progression.

## Non-Goals

- Do not let crafting mastery grant combat actions or replace combat talents.
- Do not require materials for active honing in the first version.
- Do not add sacrificed crafted items as study pieces in the first version.
- Do not add mentor reputation as a separate progression track in the first version.
- Do not add new gathering resource grades or item variants in the first version.
- Do not build player commissions, guild order boards, or marketplace demand systems in the first version.

## Core Model

Existing `PlayerSkill` rows remain the source of normal skill XP, levels, recipe gates, action gates, leaderboards, and equipment requirements. Vocation mastery is a separate player-facing profession layer above those skills.

Players do not hone `weaponsmithing` directly. They hone vocations such as Weaponsmith, Bowyer, Staffwright, Tailor, Prospector, or Alchemist.

Core loop:

1. In town, the player trains with a relevant mentor and spends turns from the global daily active honing cap.
2. The player gains vocation mastery XP.
3. Vocation XP grants ranks over time.
4. Ranks grant mastery points.
5. Mastery points unlock named techniques in that vocation.
6. Unlocked techniques can be applied during eligible craft or gather actions.
7. Normal craft and gather actions also grant slower passive mastery XP to their natural vocation.

The exploratory `PlayerSkill.honing` JSON design should not be the target architecture. Vocation state should be stored in dedicated vocation tables or equivalent first-class structures.

## Vocation Map

Launch includes all core vocations with focused depth.

| Vocation | Natural Actions | Existing Skill Dependencies |
| --- | --- | --- |
| Prospector | Mining nodes, ore/stone extraction, mining gem crits | `mining`, with `refining` adjacency for metalwork |
| Forester | Woodcutting nodes, log extraction, resin/sap crits | `woodcutting`, with `refining` adjacency for planks |
| Herbalist | Foraging nodes, herb extraction, foraging gem crits | `foraging`, with `alchemy` adjacency |
| Weaponsmith | Swords, maces, melee forged weapons | `weaponsmithing`, `refining` |
| Bowyer | Bows, crossbows, ranged weapon craft | `weaponsmithing`, `woodcutting`, plank/refining materials |
| Staffwright | Staves and magical implements | `weaponsmithing`, `woodcutting`, `jewelcrafting` adjacency |
| Armorer | Metal armor, shields, heavy protection | `armorsmithing`, `refining` |
| Leatherworker | Leather armor, hide, chitin, scale work | `leatherworking`, `tanning` |
| Tailor | Cloth armor, robes, bags, stitched gear | `tailoring`, `weaving` |
| Jeweller | Rings, charms, amulets, gem setting | `jewelcrafting`, gem processing |
| Alchemist | Potions and consumables | `alchemy`, `foraging` |

Vocation progress is action/output driven. A bow recipe may still use `weaponsmithing` internally, but it grants Bowyer mastery and can use Bowyer techniques. A staff grants Staffwright mastery. A sword grants Weaponsmith mastery. Ambiguous recipes must have an explicit vocation mapping in shared definitions or seed data.

## Progression And Caps

There is one global daily active honing cap per player. Active honing always costs turns and counts against that cap. The cap creates seasonal specialization pressure while still allowing permanent characters to broaden over a long timeline.

Passive mastery XP comes from normal craft and gather actions and goes to the action's natural vocation. Passive XP uses the same mastery track, but is slower than active honing.

Progression layers:

| Layer | Purpose |
| --- | --- |
| Vocation XP | Long-term mastery progress |
| Vocation Rank | Milestones earned from XP |
| Mastery Points | Currency granted by ranks |
| Techniques | Named unlocks bought with mastery points |
| Passive Conveniences | Small automatic rank benefits |
| Craft/Gather Marks | Visible result labels when techniques are applied |

Technique respecs should preserve vocation XP and rank, but refund only part of spent mastery points. This lets players recover from mistakes without allowing cheap daily swaps into the perfect seasonal loadout.

The active honing cap resets at UTC midnight, matching the quest daily reset convention from `getDayStart()`. It is not a rolling window like skill XP efficiency.

## Techniques

Each vocation launches with 2-3 branches, each containing 2-3 techniques. Players choose techniques within a vocation. Advanced techniques require both vocation mastery and the relevant underlying skill or recipe tier, so honing never bypasses normal skill progression.

Techniques are mostly tradeoff-based, but higher mastery must unlock genuinely useful capabilities. Long-term investment should matter through access to stronger or more specialized techniques, improved tradeoff ratios, and small passive conveniences.

Crafting techniques are selected per craft action:

- The player chooses zero or one eligible technique for the craft batch.
- The resulting item records a visible craft mark, such as `Sharpened`, `Tight-Drawn`, `Reinforced`, or `Spellwoven`.
- The item UI explains the mark's mechanical tradeoff.

Gathering techniques are selected per gather action:

- Field techniques affect existing systems: resource yield, turn cost, node depletion, discovery, and gem crit chance.
- Gathering techniques must not invent new resource grades for the first version.

Example techniques:

- Weaponsmith `Sharpened Edge`: more melee damage, lower max durability.
- Bowyer `Tight String`: more ranged power and stronger light/normal/skill shots from the marked bow, with faster durability loss and a small accuracy tradeoff.
- Staffwright `Overcharged Focus`: more magic power, higher mana cost.
- Staffwright `Efficient Channel`: lower mana cost, lower magic power or effect strength.
- Armorer `Reinforced Plate`: more defence, lower evasion or dodge.
- Armorer `Articulated Plate`: less defence, smaller evasion penalty or better dodge.
- Jeweller `Focused Setting`: stronger stat focus, narrower stat pool.
- Alchemist `Concentrated Batch`: stronger potion effect, lower output or higher turn cost.
- Prospector `Careful Extraction`: higher raw gem crit chance, lower ore yield or higher turn cost.
- Forester `Clean Notch`: higher resin/sap crit chance, higher turn cost.
- Herbalist `Patient Picking`: higher foraging gem crit chance, lower bulk yield or higher turn cost.

## Artisan Combat Marks

High-tier artisan techniques can create combat profile marks on items. These marks modify how an item supports existing combat actions. They must never unlock combat actions by themselves.

Rules:

- Any eligible player can equip the item if they meet normal equipment requirements.
- If the wielder uses a matching action or action family, the mark modifies that action.
- If the wielder does not use the matching action, the mark provides no benefit.
- Family marks target broad action groups, such as heavy physical attacks, ranged attacks, defensive actions, magic offensive actions, or potion actions.
- Named-action marks target specific actions, such as `heavy_attack`, `volley`, `counter`, `ward`, or `meteor_strike`.

Examples:

- Weaponsmith `Execution Edge`: improves `heavy_attack`, increases stamina cost and durability loss.
- Weaponsmith `Duelist Balance`: improves `counter` support or stamina efficiency, lowers raw damage.
- Bowyer `Volley Limbs`: improves `volley` or ranged area attacks, lowers single-target power.
- Bowyer `Snap Shot Frame`: improves light/normal ranged action efficiency, lowers heavy-shot damage.
- Staffwright `Ward Focus`: improves `ward` or magic defence while wielded, lowers magic power.
- Staffwright `Channel Rod`: improves damage spells, increases mana cost.
- Armorer `Bulwark Plate`: improves `defend`, lowers dodge/evasion.
- Tailor `Spellweave Lining`: improves mana efficiency, provides less armor.
- Leatherworker `Skirmisher Cut`: improves dodge/counter play, provides less defence.
- Jeweller `Focus Setting`: strengthens a chosen stat lane or crit style, narrows flexibility.

## Mentors And World Integration

Honing is taught by NPC mentors and town stations, not by a generic perk screen.

- Millbrook and Thornwall both teach basic honing and rank 1-4 techniques for every vocation, so early-zone players are not pushed into whichever vocation happens to have the nearest named mentor.
- Thornwall teaches rank 5+ advanced and prestige techniques.
- Core gates are town access, vocation rank, mastery points, and underlying skill/recipe tier.
- Achievements and titles can add recognition, dialogue, and prestige, but should not block core technique access.

Example mentor ownership:

- Kessa, Rowan, Vesper, and other town mentors can all route players into basic honing and low-rank technique study.
- Higher-zone specialists such as Orin and Thornwall masters unlock the advanced techniques once the player has the vocation rank and mastery points.

The player-facing UI should feel like visiting a craft mentor or station in town. It should show vocation rank, branches, learned techniques, mentor-locked techniques, and remaining daily active honing cap. Craft and gather screens should expose eligible unlocked techniques at the moment of action.

## Achievements, Titles, And Prestige

Vocations integrate with the existing achievement/title system.

| Achievement Type | What It Rewards | Example |
| --- | --- | --- |
| Mastery | Long-term honing investment | Reach Bowyer rank 10, 25, 50 |
| Deed | Using techniques in play | Craft 50 Tight-Drawn bows |
| Branch | Specializing inside a vocation | Learn 5 Draw branch techniques |
| Technique Use | Repeatedly applying chosen methods | Use vocation techniques 50 times |
| Combat Mark | Supplying a playstyle | Craft 25 items marked for `heavy_attack` |
| Gathering Technique | Field expertise | Find 100 gems while using Careful Extraction |
| Prestige | Rare/high-tier accomplishments | Craft an epic item with a high-tier mark |

Titles should include both broad vocation titles and branch/deed titles. The launch implementation uses natural per-vocation focus titles for early identity, including `Stone Reader`, `Stringwright`, `Edgekeeper`, `Wardweaver`, `Facet-Speaker`, and `Retort Keeper`.

- Broad examples: `Master Bowyer`, `Master Alchemist`, `Master Jeweller`
- Branch/deed examples: `Trueflight`, `Edgewright`, `Bulwark Maker`, `Spellweaver`, `Clean Cutter`
- Prestige examples: rare titles for high-tier marked epic or legendary crafts

Major milestones should create activity log and chat moments: first technique learned, first marked item, rank milestones, and prestige marked crafts.

## Data And System Boundaries

Suggested persistent structures:

| Model | Purpose |
| --- | --- |
| `PlayerVocation` | One row per player/vocation: XP, rank, mastery points earned/spent |
| `PlayerVocationTechnique` | Learned techniques for a vocation |
| `PlayerVocationDailyCap` | Single row per player tracking global active honing spent and UTC day reset timestamp |
| Item craft mark fields | Applied technique/mark metadata on crafted items |
| Shared definitions | Static vocation, branch, technique, mentor, and action-mapping definitions |

Craft marks are first-class item metadata. They should store technique id, display mark name, mechanical modifiers, and optionally crafter identity later if provenance is added. They should not exist only as arbitrary hidden `bonusStats`.

Combat profile techniques require first-class item-derived modifiers for:

- weapon power/stat deltas
- durability and degradation
- action stamina and mana cost
- action damage, accuracy, crit, or effect values
- armor defence/evasion/dodge tradeoffs
- action-family and named-action targeting

Clean boundaries:

- API services validate unlocks, apply craft/gather technique choices, store item marks, and update mastery XP.
- Shared package owns definitions and DTO types.
- Game engine remains pure and receives explicit equipment/combat modifiers.
- Route handlers orchestrate requests and responses while delegating business logic to services.

## API And UI Shape

Target API surfaces:

- `GET /vocations`: player vocation state, definitions, daily cap status, and mentor availability.
- `POST /vocations/hone`: spend turns on a vocation with a mentor.
- `POST /vocations/techniques/learn`: spend mastery points to learn a technique.
- `POST /vocations/techniques/respec`: unlearn techniques with partial mastery point refund.
- Craft and gather endpoints accept an optional `techniqueId` when the selected action is eligible.

UI surfaces:

- A town mentor/vocation screen for active honing and technique learning.
- Crafting screen technique selector for eligible recipes.
- Gathering screen technique selector for eligible nodes.
- Item detail display for visible craft marks and their mechanical effects.
- Achievement/title screen additions for vocation mastery and deed achievements.

## Launch Scope

Launch includes:

- 11 vocations with focused depth.
- 2-3 branches per vocation.
- 2-3 techniques per branch.
- Small rank-based passive conveniences.
- Active honing with one global daily turn cap.
- Passive mastery XP from natural craft/gather actions.
- Mastery points and partial-refund technique respecs.
- Visible item marks for crafting techniques.
- Field technique selection for gathering.
- Combat profile marks, including family and named-action modifiers.
- Achievement/title hooks.
- Mentor/town gating.

Launch tuning constants:

- Active honing cap: 10,800 turns per UTC day across all vocations.
- Active honing action size: 10 to 10,800 turns.
- Active honing XP: 0.1 vocation XP per honing turn, so spending the full daily cap grants 1,080 vocation XP.
- Passive craft mastery XP: 20% of the craft's base turn cost.
- Passive gathering mastery XP: 15% of the gather action's base turn cost.
- Technique respec refund: 60% of spent mastery points, preserving vocation XP/rank.

These values intentionally make daily active honing the reliable specialization path for seasonal characters while still allowing permanent-realm characters to broaden across many vocations over time.

Out of scope for launch:

- Crafted item sacrifice as study pieces.
- Mentor reputation as a separate track.
- New gathering resource grades or item variants.
- Crafter provenance, unless item metadata work makes it cheap.
- Player commissions or order boards.
- Guild-specific crafting contracts.
- Marketplace pricing and demand systems.

## Implementation Notes From The Exploratory Worktree

The current exploratory implementation adds a `honing` JSON blob to `PlayerSkill`, a few generic perk ids, a global daily cap on `Player`, and percentage effects wired directly into crafting and gathering. Useful lessons from that work:

- The daily cap and town-only validation are correct high-level constraints.
- Passive progress from natural actions is desirable.
- Generic perks are not enough for the desired design.
- `PlayerSkill.honing` is the wrong persistence boundary for vocation identity.
- Craft/gather effects should be definition-driven, visible, and specific to vocation techniques.
- UI copy and backend behavior need to be driven by the same shared technique definitions.

## Testing Strategy

Focused tests should cover:

- Vocation mapping from recipes, item types, slots, and resource nodes.
- Active honing cap, reset behavior, turn spend, and insufficient-turn failures.
- Passive XP from craft/gather actions to the natural vocation.
- Mastery rank and mastery point grants.
- Technique learn/respec rules and partial refunds.
- Craft eligibility and item mark persistence.
- Gathering technique modifiers against existing yield, turn cost, capacity, and gem crit behavior.
- Combat mark behavior for matching action families and named actions.
- Non-matching combat marks doing nothing.
- Achievement stat increments and title unlock visibility.
- API boundary validation with Zod.

Broader verification should include existing crafting, gathering, combat, achievement, and equipment tests because this system crosses all of those surfaces.

## Risks

- Scope creep: all vocations at launch is content-heavy even with focused trees.
- Balance: action-cost modifiers are powerful and affect combat XP attribution because resource cost contributes to skill XP splitting.
- UI complexity: craft/gather screens need technique selection without slowing common workflows.
- Data migration: existing items without marks must remain valid.
- Marketplace pressure: marked gear may change the economy even before explicit commission tools exist.

## Future Work

- Study pieces: sacrificing crafted outputs for capped insight.
- Mentor reputation and deeper dialogue recognition.
- Crafter provenance on items.
- Player commissions and guild supply contracts.
- New resource variants once the base technique system is stable.
- Prestige mentor quests for ultra-high mastery.
