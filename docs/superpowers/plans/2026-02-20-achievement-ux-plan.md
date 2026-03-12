# Achievement UX Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make achievements more visible and less overwhelming via chain grouping, tab reordering, bottom nav badge, and persistent clickable toasts.

**Architecture:** Frontend-only changes. Add a shared utility to group achievement chains from existing `statKey`/`familyKey` fields. Rewrite AchievementsScreen to render one card per chain. Update BottomNav and AchievementToast components. No backend or schema changes.

**Tech Stack:** React, TypeScript, Next.js, shared package

---

### Task 1: Achievement Chain Utility

**Files:**
- Create: `packages/shared/src/utils/achievementChains.ts`
- Create: `packages/shared/src/utils/achievementChains.test.ts`
- Modify: `packages/shared/src/index.ts:16` (add export)

**Step 1: Write the test**

```typescript
// packages/shared/src/utils/achievementChains.test.ts
import { describe, expect, it } from 'vitest';
import type { PlayerAchievementProgress } from '../types/achievement.types';
import { groupAchievementChains, type AchievementChainEntry } from './achievementChains';

const makeAch = (
  overrides: Partial<PlayerAchievementProgress> & { id: string; threshold: number },
): PlayerAchievementProgress => ({
  category: 'combat',
  title: 'Test',
  description: 'Test',
  progress: 0,
  unlocked: false,
  ...overrides,
});

describe('groupAchievementChains', () => {
  it('groups achievements by statKey into a single chain entry showing the current tier', () => {
    const achievements: PlayerAchievementProgress[] = [
      makeAch({ id: 'kills_100', statKey: 'totalKills', threshold: 100, tier: 1, progress: 100, unlocked: true, rewardClaimed: true }),
      makeAch({ id: 'kills_500', statKey: 'totalKills', threshold: 500, tier: 2, progress: 150, unlocked: false }),
      makeAch({ id: 'kills_1000', statKey: 'totalKills', threshold: 1000, tier: 3, progress: 150, unlocked: false }),
    ];

    const result = groupAchievementChains(achievements);
    const chain = result.find((e) => e.achievement.id === 'kills_500');
    expect(chain).toBeDefined();
    expect(chain!.currentTier).toBe(2);
    expect(chain!.totalTiers).toBe(3);
    expect(chain!.completedTiers).toBe(1);
    // Only one entry for the whole kills chain
    expect(result.filter((e) => e.achievement.statKey === 'totalKills')).toHaveLength(1);
  });

  it('shows the highest completed tier when all tiers are done', () => {
    const achievements: PlayerAchievementProgress[] = [
      makeAch({ id: 'a1', statKey: 'totalCrafts', threshold: 1, tier: 1, progress: 1, unlocked: true }),
      makeAch({ id: 'a2', statKey: 'totalCrafts', threshold: 50, tier: 2, progress: 50, unlocked: true }),
    ];

    const result = groupAchievementChains(achievements);
    const chain = result.find((e) => e.achievement.statKey === 'totalCrafts');
    expect(chain!.achievement.id).toBe('a2'); // highest completed
    expect(chain!.completedTiers).toBe(2);
    expect(chain!.allComplete).toBe(true);
  });

  it('treats singleton achievements (no statKey/familyKey) as their own chain', () => {
    const achievements: PlayerAchievementProgress[] = [
      makeAch({ id: 'secret_death', statKey: 'totalDeaths', threshold: 1, progress: 0, unlocked: false }),
    ];
    const result = groupAchievementChains(achievements);
    expect(result).toHaveLength(1);
    expect(result[0].totalTiers).toBe(1);
  });

  it('groups family achievements by familyKey', () => {
    const achievements: PlayerAchievementProgress[] = [
      makeAch({ id: 'family_wolves_500', category: 'family', familyKey: 'wolves', threshold: 500, tier: 1, progress: 200, unlocked: false }),
      makeAch({ id: 'family_wolves_2500', category: 'family', familyKey: 'wolves', threshold: 2500, tier: 2, progress: 200, unlocked: false }),
      makeAch({ id: 'family_wolves_5000', category: 'family', familyKey: 'wolves', threshold: 5000, tier: 3, progress: 200, unlocked: false }),
    ];

    const result = groupAchievementChains(achievements);
    expect(result.filter((e) => e.achievement.familyKey === 'wolves')).toHaveLength(1);
    expect(result[0].achievement.id).toBe('family_wolves_500');
    expect(result[0].totalTiers).toBe(3);
  });

  it('returns correct total counts across all chains', () => {
    const achievements: PlayerAchievementProgress[] = [
      makeAch({ id: 'a1', statKey: 'totalKills', threshold: 100, tier: 1, progress: 100, unlocked: true }),
      makeAch({ id: 'a2', statKey: 'totalKills', threshold: 500, tier: 2, progress: 150, unlocked: false }),
      makeAch({ id: 'b1', threshold: 1, progress: 1, unlocked: true }), // singleton
    ];

    const result = groupAchievementChains(achievements);
    const totalAchievements = result.reduce((sum, e) => sum + e.totalTiers, 0);
    const totalCompleted = result.reduce((sum, e) => sum + e.completedTiers, 0);
    expect(totalAchievements).toBe(3);
    expect(totalCompleted).toBe(2); // a1 + b1
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx vitest run packages/shared/src/utils/achievementChains.test.ts`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```typescript
// packages/shared/src/utils/achievementChains.ts
import type { PlayerAchievementProgress } from '../types/achievement.types';

export interface AchievementChainEntry {
  /** The achievement to display (current active tier or highest completed) */
  achievement: PlayerAchievementProgress;
  /** 1-based tier number of the displayed achievement */
  currentTier: number;
  /** Total tiers in this chain */
  totalTiers: number;
  /** How many tiers are completed (unlocked) */
  completedTiers: number;
  /** True if every tier in the chain is unlocked */
  allComplete: boolean;
}

/**
 * Groups achievements into chains by statKey/familyKey.
 * Returns one entry per chain showing the current active tier
 * (lowest incomplete, or highest completed if all done).
 * Achievements with no statKey/familyKey are treated as singleton chains.
 */
export function groupAchievementChains(
  achievements: PlayerAchievementProgress[],
): AchievementChainEntry[] {
  // Group by chain key
  const chains = new Map<string, PlayerAchievementProgress[]>();

  for (const ach of achievements) {
    const key = ach.statKey ?? ach.familyKey ?? `__singleton_${ach.id}`;
    const group = chains.get(key);
    if (group) {
      group.push(ach);
    } else {
      chains.set(key, [ach]);
    }
  }

  const result: AchievementChainEntry[] = [];

  for (const group of chains.values()) {
    // Sort by tier (or threshold as fallback)
    group.sort((a, b) => (a.tier ?? a.threshold) - (b.tier ?? b.threshold));

    const completedTiers = group.filter((a) => a.unlocked).length;
    const allComplete = completedTiers === group.length;

    // Pick the achievement to show: lowest incomplete, or highest completed
    const active = group.find((a) => !a.unlocked) ?? group[group.length - 1];
    const currentTier = group.indexOf(active) + 1;

    result.push({
      achievement: active,
      currentTier,
      totalTiers: group.length,
      completedTiers,
      allComplete,
    });
  }

  return result;
}
```

**Step 4: Export from shared index**

Add to `packages/shared/src/index.ts` after line 16:
```typescript
export * from './utils/achievementChains';
```

**Step 5: Run test to verify it passes**

Run: `npx vitest run packages/shared/src/utils/achievementChains.test.ts`
Expected: PASS (5 tests)

**Step 6: Build shared package**

Run: `npm run build --workspace=packages/shared`
Expected: Clean build

**Step 7: Commit**

```bash
git add packages/shared/src/utils/ packages/shared/src/index.ts
git commit -m "feat: add achievement chain grouping utility"
```

---

### Task 2: Rewrite AchievementsScreen with Chains

**Files:**
- Modify: `apps/web/src/components/screens/Achievements.tsx` (full rewrite)

**Step 1: Rewrite the Achievements component**

Replace the entire file. Key changes:
- Import and use `groupAchievementChains` from `@adventure/shared`
- Add completion counter at top ("X / Y Achievements" with progress bar)
- Render one card per chain entry instead of one per achievement
- Add tier star indicators to each card
- Keep existing: category filter, title selector, sort logic, claim button, reward badges, progress bar

```tsx
'use client';

import { useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { PixelButton } from '@/components/PixelButton';
import { StatBar } from '@/components/StatBar';
import { groupAchievementChains } from '@adventure/shared';
import type { PlayerAchievementProgress, AchievementRewardResponse } from '@/lib/api';

interface AchievementsProps {
  achievements: PlayerAchievementProgress[];
  unclaimedCount: number;
  activeTitle: string | null;
  onClaim: (achievementId: string) => Promise<void>;
  onSetTitle: (achievementId: string | null) => Promise<void>;
}

const CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'combat', label: 'Combat' },
  { id: 'exploration', label: 'Exploration' },
  { id: 'crafting', label: 'Crafting' },
  { id: 'skills', label: 'Skills' },
  { id: 'gathering', label: 'Gathering' },
  { id: 'bestiary', label: 'Bestiary' },
  { id: 'general', label: 'General' },
  { id: 'family', label: 'Families' },
];

function RewardBadge({ reward }: { reward: AchievementRewardResponse }) {
  switch (reward.type) {
    case 'attribute_points': return <span className="text-xs text-[var(--rpg-gold)]">+{reward.amount} attr pt{reward.amount > 1 ? 's' : ''}</span>;
    case 'turns': return <span className="text-xs text-[var(--rpg-blue-light)]">+{reward.amount.toLocaleString()} turns</span>;
    case 'item': return <span className="text-xs text-[var(--rpg-purple)]">Unique item</span>;
    case 'xp': return <span className="text-xs text-[var(--rpg-green-light)]">+{reward.amount} XP</span>;
    default: return null;
  }
}

function TierStars({ current, total }: { current: number; total: number }) {
  if (total <= 1) return null;
  return (
    <span className="inline-flex gap-0.5 ml-1">
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={i < current ? 'text-[var(--rpg-gold)]' : 'text-[var(--rpg-text-secondary)] opacity-40'}
          style={{ fontSize: '10px' }}
        >
          ★
        </span>
      ))}
    </span>
  );
}

export function Achievements({ achievements, unclaimedCount, activeTitle, onClaim, onSetTitle }: AchievementsProps) {
  const [activeCategory, setActiveCategory] = useState('all');
  const [claimingId, setClaimingId] = useState<string | null>(null);

  // Chain grouping
  const chainEntries = groupAchievementChains(achievements);
  const totalAchievements = chainEntries.reduce((sum, e) => sum + e.totalTiers, 0);
  const totalCompleted = chainEntries.reduce((sum, e) => sum + e.completedTiers, 0);

  // Filter by category
  const filtered = activeCategory === 'all'
    ? chainEntries
    : chainEntries.filter((e) => e.achievement.category === activeCategory);

  // Sort: unclaimed first, then completed, then by progress
  const sorted = [...filtered].sort((a, b) => {
    const aAch = a.achievement;
    const bAch = b.achievement;
    const aClaimable = aAch.unlocked && !aAch.rewardClaimed && (aAch.rewards?.length ?? 0) > 0;
    const bClaimable = bAch.unlocked && !bAch.rewardClaimed && (bAch.rewards?.length ?? 0) > 0;
    if (aClaimable && !bClaimable) return -1;
    if (!aClaimable && bClaimable) return 1;
    if (aAch.unlocked && !bAch.unlocked) return -1;
    if (!aAch.unlocked && bAch.unlocked) return 1;
    return (bAch.progress / bAch.threshold) - (aAch.progress / aAch.threshold);
  });

  const handleClaim = async (id: string) => {
    setClaimingId(id);
    try { await onClaim(id); } finally { setClaimingId(null); }
  };

  // Collect unlocked titles for title selector
  const unlockedTitles = achievements.filter((a) => a.unlocked && a.titleReward);

  return (
    <div className="space-y-4">
      {/* Completion counter */}
      <PixelCard padding="sm">
        <div className="flex items-center justify-between mb-1">
          <span className="text-sm font-medium text-[var(--rpg-text-primary)]">
            {totalCompleted} / {totalAchievements} Achievements
          </span>
          <span className="text-xs text-[var(--rpg-text-secondary)]">
            {totalAchievements > 0 ? Math.round((totalCompleted / totalAchievements) * 100) : 0}%
          </span>
        </div>
        <StatBar current={totalCompleted} max={totalAchievements} color="xp" size="sm" />
      </PixelCard>

      {/* Title selector */}
      {unlockedTitles.length > 0 && (
        <PixelCard padding="sm">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-[var(--rpg-text-secondary)]">Active title:</span>
            <button
              onClick={() => onSetTitle(null)}
              className={`px-2 py-1 rounded text-xs transition-colors ${
                !activeTitle
                  ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                  : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)] hover:bg-[var(--rpg-border)]'
              }`}
            >
              None
            </button>
            {unlockedTitles.map((a) => (
              <button
                key={a.id}
                onClick={() => onSetTitle(a.id)}
                className={`px-2 py-1 rounded text-xs transition-colors ${
                  activeTitle === a.id
                    ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                    : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)] hover:bg-[var(--rpg-border)]'
                }`}
              >
                {a.titleReward}
              </button>
            ))}
          </div>
        </PixelCard>
      )}

      {/* Category filter */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {CATEGORIES.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setActiveCategory(cat.id)}
            className={`px-3 py-1.5 rounded-lg text-sm whitespace-nowrap transition-colors ${
              activeCategory === cat.id
                ? 'bg-[var(--rpg-gold)] text-[var(--rpg-background)]'
                : 'bg-[var(--rpg-surface)] text-[var(--rpg-text-secondary)]'
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      {/* Achievement cards */}
      <div className="space-y-2">
        {sorted.map((entry) => {
          const achievement = entry.achievement;
          const isClaimable = achievement.unlocked && !achievement.rewardClaimed && (achievement.rewards?.length ?? 0) > 0;
          const isClaiming = claimingId === achievement.id;

          return (
            <PixelCard key={achievement.id} padding="sm">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      {achievement.unlocked && (
                        <span className="text-[var(--rpg-green-light)]">&#x2713;</span>
                      )}
                      <span className={`font-medium ${
                        achievement.unlocked
                          ? 'text-[var(--rpg-gold)]'
                          : 'text-[var(--rpg-text-primary)]'
                      }`}>
                        {achievement.title}
                      </span>
                      <TierStars current={entry.completedTiers} total={entry.totalTiers} />
                      {achievement.titleReward && achievement.unlocked && (
                        <span className="text-xs text-[var(--rpg-purple)] italic">
                          &quot;{achievement.titleReward}&quot;
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-[var(--rpg-text-secondary)]">
                      {achievement.description}
                    </p>
                  </div>
                  {isClaimable && (
                    <PixelButton
                      variant="gold"
                      size="sm"
                      onClick={() => handleClaim(achievement.id)}
                      disabled={isClaiming}
                    >
                      {isClaiming ? '...' : 'Claim'}
                    </PixelButton>
                  )}
                </div>

                {/* Progress bar */}
                {!achievement.unlocked && (
                  <StatBar
                    current={achievement.progress}
                    max={achievement.threshold}
                    color="xp"
                    size="sm"
                    showNumbers
                  />
                )}

                {/* Rewards */}
                {achievement.rewards && achievement.rewards.length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {achievement.rewards.map((r, i) => (
                      <RewardBadge key={i} reward={r} />
                    ))}
                  </div>
                )}
              </div>
            </PixelCard>
          );
        })}

        {sorted.length === 0 && (
          <p className="text-center text-[var(--rpg-text-secondary)] py-8">
            No achievements in this category
          </p>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Build shared package (needed for import)**

Run: `npm run build --workspace=packages/shared`

**Step 3: Verify types compile**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`
Expected: Clean (or only the pre-existing `page.tsx:333` error)

**Step 4: Commit**

```bash
git add apps/web/src/components/screens/Achievements.tsx
git commit -m "feat: render achievements as chains with tier stars and completion counter"
```

---

### Task 3: Reorder Home Sub-Tabs

**Files:**
- Modify: `apps/web/src/app/game/page.tsx:850-857` (sub-tab array)

**Step 1: Reorder the Home sub-tab array**

Change the array at ~line 850 from:
```typescript
{ id: 'home', label: 'Dashboard', badge: 0 },
{ id: 'skills', label: 'Skills', badge: 0 },
{ id: 'zones', label: 'Map', badge: 0 },
{ id: 'bestiary', label: 'Bestiary', badge: 0 },
{ id: 'worldEvents', label: 'Events', badge: 0 },
{ id: 'achievements', label: 'Achievements', badge: achievementUnclaimedCount },
{ id: 'leaderboard', label: 'Rankings', badge: 0 },
```

To:
```typescript
{ id: 'home', label: 'Dashboard', badge: 0 },
{ id: 'zones', label: 'Map', badge: 0 },
{ id: 'worldEvents', label: 'Events', badge: 0 },
{ id: 'achievements', label: 'Achievements', badge: achievementUnclaimedCount },
{ id: 'leaderboard', label: 'Rankings', badge: 0 },
{ id: 'bestiary', label: 'Bestiary', badge: 0 },
{ id: 'skills', label: 'Skills', badge: 0 },
```

**Step 2: Verify types compile**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

**Step 3: Commit**

```bash
git add apps/web/src/app/game/page.tsx
git commit -m "feat: reorder home sub-tabs — achievements moved to 4th position"
```

---

### Task 4: Bottom Nav Red Dot

**Files:**
- Modify: `apps/web/src/components/BottomNav.tsx` (add badge dot support)
- Modify: `apps/web/src/app/game/page.tsx:974` (pass badge prop)

**Step 1: Add `showBadge` prop to BottomNav**

Update `BottomNav.tsx` — add a `badgeTabs` prop (set of tab IDs that should show a dot), render a small red dot on matching tabs.

Change the props interface:
```typescript
interface BottomNavProps {
  activeTab: string;
  onNavigate: (tab: string) => void;
  badgeTabs?: Set<string>;
}
```

Add `badgeTabs` to the destructured props with default `new Set()`.

Inside the button, after the `<Image>` element and before the `<span>` label, add:
```tsx
{badgeTabs.has(item.id) && (
  <span className="absolute top-1 right-1/4 w-2 h-2 rounded-full bg-[var(--rpg-red)]" />
)}
```

Also add `relative` to the button's className so the absolute dot positions correctly.

**Step 2: Pass `badgeTabs` from page.tsx**

At ~line 974 where `<BottomNav>` is rendered, change:
```tsx
<BottomNav activeTab={getActiveTab()} onNavigate={handleNavigate} />
```
To:
```tsx
<BottomNav
  activeTab={getActiveTab()}
  onNavigate={handleNavigate}
  badgeTabs={achievementUnclaimedCount > 0 ? new Set(['home']) : undefined}
/>
```

**Step 3: Verify types compile**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

**Step 4: Commit**

```bash
git add apps/web/src/components/BottomNav.tsx apps/web/src/app/game/page.tsx
git commit -m "feat: add red dot badge to Home bottom nav when achievements unclaimed"
```

---

### Task 5: Persistent Clickable Achievement Toasts

**Files:**
- Modify: `apps/web/src/components/AchievementToast.tsx` (full rewrite)
- Modify: `apps/web/src/app/game/page.tsx:975` (pass navigation callback)
- Modify: `apps/web/src/app/game/useGameController.ts:538-542` (update global callback signature)

**Step 1: Rewrite AchievementToast**

Replace the entire file. Key changes:
- Remove the `setTimeout` auto-dismiss
- Add X button to dismiss individual toasts
- Make the toast body clickable (calls `onNavigate`)
- Cap visible toasts at 5, show overflow count
- Accept `onNavigate` prop

```tsx
'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

interface Toast {
  id: string;
  title: string;
  category: string;
}

interface AchievementToastProps {
  onNavigate?: () => void;
}

const MAX_VISIBLE = 5;

export function AchievementToast({ onNavigate }: AchievementToastProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    (window as unknown as Record<string, unknown>).__showAchievementToast = (toast: Toast) => {
      setToasts((prev) => [...prev, toast]);
    };
    return () => {
      delete (window as unknown as Record<string, unknown>).__showAchievementToast;
    };
  }, []);

  const dismiss = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const handleClick = (id: string) => {
    dismiss(id);
    onNavigate?.();
  };

  if (toasts.length === 0) return null;

  const visible = toasts.slice(0, MAX_VISIBLE);
  const overflow = toasts.length - MAX_VISIBLE;

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {visible.map((toast) => (
        <div
          key={toast.id}
          className="bg-[var(--rpg-surface)] border border-[var(--rpg-gold)] rounded-lg px-4 py-3 shadow-lg animate-[slideIn_0.3s_ease-out] min-w-[250px] cursor-pointer hover:border-[var(--rpg-gold)]/80 transition-colors"
          onClick={() => handleClick(toast.id)}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">&#x1F3C6;</span>
            <div className="flex-1">
              <p className="text-xs text-[var(--rpg-text-secondary)] uppercase tracking-wider">
                Achievement Unlocked
              </p>
              <p className="text-sm font-medium text-[var(--rpg-gold)]">
                {toast.title}
              </p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); dismiss(toast.id); }}
              className="p-0.5 text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)] transition-colors"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ))}
      {overflow > 0 && (
        <div
          className="bg-[var(--rpg-surface)] border border-[var(--rpg-gold)]/50 rounded-lg px-4 py-2 shadow-lg text-center cursor-pointer hover:border-[var(--rpg-gold)] transition-colors"
          onClick={() => { setToasts([]); onNavigate?.(); }}
        >
          <p className="text-xs text-[var(--rpg-gold)]">
            and {overflow} more achievement{overflow > 1 ? 's' : ''} unlocked
          </p>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Update page.tsx to pass onNavigate**

At ~line 975, change:
```tsx
<AchievementToast />
```
To:
```tsx
<AchievementToast onNavigate={() => setActiveScreen('achievements')} />
```

**Step 3: Verify types compile**

Run: `npx tsc --noEmit -p apps/web/tsconfig.json`

**Step 4: Commit**

```bash
git add apps/web/src/components/AchievementToast.tsx apps/web/src/app/game/page.tsx
git commit -m "feat: persistent clickable achievement toasts with stacking"
```

---

### Task 6: Final Verification

**Step 1: Build shared package**

Run: `npm run build --workspace=packages/shared`
Expected: Clean build

**Step 2: Full typecheck**

Run: `npm run typecheck`
Expected: Clean (or only pre-existing `page.tsx:333` error)

**Step 3: Run all tests**

Run: `npm run test`
Expected: All tests pass

**Step 4: Commit any remaining fixes**

If any fixes were needed, commit them.
