# Boss Round Log & Detailed Playback — Design

## Goal

Replace the aggregate-only boss round display with a rich, phased action log per round. Players see full roll detail for their own actions and summarized outcomes for others. Telegraph system integrated into the view.

## Data Model

### BossRoundLog (new type, stored as JSON on BossEncounter)

```typescript
interface BossRoundLog {
  round: number;
  phases: {
    playerAttacks: PlayerAttackEntry[];
    bossActions: BossActionEntry[];
    healing: HealingEntry[];
    outcome: OutcomeEntry;
  };
  telegraph: TelegraphEntry | null; // what boss telegraphed for NEXT round
}

interface PlayerAttackEntry {
  playerId: string;
  username: string;
  actionId: string;
  actionLabel: string;
  attackRoll: number;       // d20 result
  modifier: number;         // stat-based modifier
  totalRoll: number;        // attackRoll + modifier
  defenseTarget: number;    // boss defense value
  hit: boolean;
  crit: boolean;
  damageRoll?: number;      // only if hit
  damageBonus?: number;
  totalDamage?: number;
  staminaCost?: number;
  manaCost?: number;
}

interface BossActionEntry {
  actionId: string;
  actionLabel: string;
  targetMode: 'single_target' | 'aoe';
  wasTelegraphed: boolean;
  targets: {
    playerId: string;
    username: string;
    damageTaken: number;
    blocked: number;
    knockedOut: boolean;
  }[];
}

interface HealingEntry {
  playerId: string;
  username: string;
  actionLabel: string;
  amountHealed: number;
  targetPlayerId: string;
  targetUsername: string;
}

interface OutcomeEntry {
  bossHpPercent: number;
  bossDefeated: boolean;
  playersAlive: number;
  playersKnockedOut: number;
  wipe: boolean;
}

interface TelegraphEntry {
  actionId: string;
  actionLabel: string;
  targetMode: 'single_target' | 'aoe';
  warningText: string;
}
```

### Storage

- New `roundLogs Json @default("[]")` field on `BossEncounter` model
- Array of `BossRoundLog`, one per resolved round, appended after each resolution

## UI: Expanded Round Log View

Clicking a collapsed round row in `BossEncounterPanel` expands it inline. Only one round expanded at a time. Collapsed rows keep existing summary (boss damage | player damage | HP% | alive/dead).

### Phase Layout

Phases displayed with section headers: Player Attacks, Boss Actions, Healing, Outcome.

**Your actions** — expanded card with full roll breakdown: roll + modifier vs defense, hit/miss/crit, damage calc, resource costs.

**Other players** — single-line summary: "PlayerB: Power Strike -> HIT for 32 damage" or "PlayerC: Quick Slash -> MISS".

**Boss actions (telegraphed)** — highlighted border/background + "TELEGRAPHED" badge. Only applied when the move actually has `isTelegraphed`. Non-telegraphed moves render normally with no special callout.

**Telegraph warnings** — top of round shows prediction from previous round ("Boss telegraphed: Tail Sweep!"). Bottom of round shows telegraph for next round. Only shown for moves with `isTelegraphed: true`.

**Knocked out players** — skull icon + muted styling.

## UI: Pre-Round Waiting State

When a round hasn't resolved yet:

1. **Telegraph warning** from previous round (if applicable)
2. **Known boss rotation** from `PlayerBossRotation` — only actions the player witnessed while alive. Unknown slots show "???".
3. **Signed up player list** with auto-signup indicators
4. **Signup controls** — template selector, auto-signup toggle, sign up button

## Backend Changes

### Game Engine (`bossRoundResolver.ts`)

Extend `resolveBossRound()` to build `BossRoundLog` as it processes each phase. Captures roll details during player attack phase, per-target damage during boss phase, healer/target/amount during healing, and outcome stats. Determines next telegraph from boss template. Returns log alongside existing `BossRoundResult`. No changes to combat math.

### Service (`bossEncounterService.ts`)

After round resolution, append `BossRoundLog` to encounter's `roundLogs` JSON array in the same Prisma update that persists round summaries.

### Database

Migration to add `roundLogs` column to `BossEncounter`.

### API Routes (`boss.ts`)

- `GET /boss/:id` — include `roundLogs` in response
- `GET /boss/:id/round/:num` — return specific `BossRoundLog` entry + participant data
- New `GET /boss/:id/rotation` — return player's known rotation from `PlayerBossRotation`

### Frontend API Client

- Add `BossRoundLog` and sub-types
- Add `getBossRotation(id)` call

## Boss History Screen

- History list unchanged (paginated entries with summary stats)
- Expanding an entry lazy-loads full encounter via `GET /boss/:id` (includes `roundLogs`)
- Same expandable round log view as the live panel — full detail for self, summary for others, telegraph highlights

## Out of Scope

- Animated/timed playback
- Changes to boss combat math or balancing
- Changes to loot/contribution system
- New boss actions or telegraph types
- Mobile-specific layout adjustments
