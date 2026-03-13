# Template Combat Replay: Post-Fight Strategy Tuning

**Category:** ux
**Priority:** high
**Scope:** medium

## Description
After any combat (real or training), add a "Replay with edits" button that lets the player modify their combat template slots in-place and instantly re-simulate the same fight against the same mob (same prefix, same stats) to see how different slot conditions and action choices would have changed the outcome. The training ground already builds both combatants and calls `runTemplateCombat` as a pure function with no side effects, so replaying is architecturally free -- the server just re-runs the engine with the tweaked template without persisting anything. This closes the biggest UX gap in the template system: players currently have to guess whether a conditional slot change (e.g., switching from "heal_self when HP below 30%" to "ward when HP below 40%") actually improves their win rate, save the template, then go find the mob again to test it. Instant replay turns template editing from blind trial-and-error into an interactive feedback loop, dramatically increasing engagement with the conditional combat system that is otherwise too opaque for most players to bother optimizing.
