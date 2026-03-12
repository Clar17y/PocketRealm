# PR Review Prompt: feature/tutorial-system

## Instructions

You are reviewing PR `feature/tutorial-system` for an Adventure RPG monorepo. The branch has 3 commits totalling +493 / -3,359 lines across 28 files. The deletions are mostly removed plan docs (not code).

Review the diff below against the requirements, checking for:

### Correctness
1. **Registration seeding** (`ensureStarterEncounterAndNodes`): Does it correctly find the starter town → first wild zone → seed 2 resource nodes (Copper Ore, Oak Log, capacity 6) and 1 small encounter site (2 trash mobs, no prefix)?
2. **Idempotency**: Is the function safe to call twice for the same player? Check the duplicate guards for both resource nodes and encounter sites.
3. **Tutorial step validation** (PATCH `/player/tutorial`): Does it correctly enforce forward-only advancement (+1) and skip (-1)? Does it block advancing past step 8?
4. **Migration safety**: The migration adds `tutorial_step` default 0, then UPDATEs existing players to 8 (completed). Is this correct for existing players who should skip the tutorial?
5. **Player starting zone**: Registration now places the player in the first connected wild zone instead of the starter town. Is `homeTownId` still set to the starter town correctly?

### Data Integrity
6. **Encounter site mobs JSON**: Does the structure match `{ mobs: [{ slot, mobTemplateId, role, prefix, status }] }` as used by the combat system?
7. **Resource node capacity**: Is `remainingCapacity: 6` the right amount for the tutorial flow (3 ore → 3 ingots → 1 helm, 3 logs → 3 planks → 1 sword)?
8. **`mobName` removal**: Several files remove `mobName` from combat responses, keeping only `mobDisplayName`. Check that no remaining consumer references `mobName` in a way that would break.

### Frontend
9. **Tutorial state flow**: `useGameController` calls `advanceTutorial(STEP_X)` after explore, combat, gather, travel, craft, equip actions. Does each trigger advance the correct step?
10. **TutorialDialog**: It shows on step change and has a "Got it" button. For the welcome step, dismissing triggers `onDismiss` → `advanceTutorial(WELCOME)`. For the done step, same pattern. For intermediate steps (1-6), there's no dialog dismiss trigger — they auto-advance via game actions. Is this correct?
11. **TutorialBanner**: Shows step-specific banner text with a "Skip" button. Does `skipTutorial` correctly send `-1` to the API?
12. **BottomNav pulse**: `pulseTabs` prop highlights the tab the player should navigate to. Is the pulse CSS animation clean and does it only show on non-active tabs?

### Edge Cases
13. **No resource nodes in zone**: If Copper Ore or Oak Log `ResourceNode` templates don't exist in the wild zone, the function silently skips. Is this acceptable or should it warn?
14. **No mob families in zone**: Same silent skip if no `ZoneMobFamily` or no trash members exist.
15. **Race conditions**: Registration calls `ensureStarterDiscoveries` then `ensureStarterEncounterAndNodes` sequentially (not in a transaction). Could a failure between them leave the player in a bad state?
16. **Tutorial step stored as plain int**: No enum validation on the DB column. Could invalid values cause issues?

### Code Quality
17. **`prisma as unknown as any`**: The service uses untyped Prisma access. Are the query shapes correct for the actual schema?
18. **Test coverage**: There's a unit test for tutorial step validation logic but no integration test for `ensureStarterEncounterAndNodes`. Is that sufficient?
19. **Removed mob image references**: `monsterImageSrc` imports were removed from CombatHistory, BossHistory, CombatPlayback, TurnPlayback. Were these images actually being rendered before? Is removing them intentional cleanup or regression?

### Output Format

For each issue found, categorize as:
- **Blocker**: Must fix before merge (bugs, data loss, security)
- **Major**: Should fix (logic errors, missing error handling)
- **Minor**: Nice to have (style, naming, minor improvements)
- **Note**: Informational observation, no action needed

## Diff

```diff
diff --git a/apps/api/src/routes/auth.ts b/apps/api/src/routes/auth.ts
index 4c85108..16c047d 100644
--- a/apps/api/src/routes/auth.ts
+++ b/apps/api/src/routes/auth.ts
@@ -11,7 +11,7 @@ import {
   sessionInactivityCutoff,
   verifyRefreshToken,
 } from '../middleware/auth';
-import { ensureStarterDiscoveries } from '../services/zoneDiscoveryService';
+import { ensureStarterDiscoveries, ensureStarterEncounterAndNodes } from '../services/zoneDiscoveryService';

 export const authRouter = Router();

@@ -60,9 +60,15 @@ authRouter.post('/register', async (req, res, next) => {
     // Hash password
     const passwordHash = await bcrypt.hash(body.password, 10);

-    // Find starter zone
-    const starterZone = await prisma.zone.findFirst({ where: { isStarter: true } });
-    if (!starterZone) throw new AppError(500, 'No starter zone configured', 'NO_STARTER_ZONE');
+    // Find starter town (for homeTownId) and first connected wild zone (for currentZoneId)
+    const starterTown = await prisma.zone.findFirst({ where: { isStarter: true } });
+    if (!starterTown) throw new AppError(500, 'No starter zone configured', 'NO_STARTER_ZONE');
+
+    const firstWildConnection = await prisma.zoneConnection.findFirst({
+      where: { fromId: starterTown.id },
+      include: { toZone: true },
+    });
+    const startingZone = firstWildConnection?.toZone ?? starterTown;

     // Create player with all related records
     const player = await prisma.player.create({
@@ -71,8 +77,8 @@ authRouter.post('/register', async (req, res, next) => {
         email: body.email,
         passwordHash,
         lastActiveAt: now,
-        currentZoneId: starterZone.id,
-        homeTownId: starterZone.id,
+        currentZoneId: startingZone.id,
+        homeTownId: starterTown.id,
         turnBank: {
           create: {
             currentTurns: TURN_CONSTANTS.STARTING_TURNS,
@@ -95,6 +101,9 @@ authRouter.post('/register', async (req, res, next) => {
     // Create initial zone discovery records
     await ensureStarterDiscoveries(player.id);

+    // Seed starter resource nodes and encounter site
+    await ensureStarterEncounterAndNodes(player.id);
+
     // Generate tokens
     const payload = { playerId: player.id, username: player.username, role: player.role };
     const accessToken = generateAccessToken(payload);

diff --git a/apps/api/src/routes/combat.ts b/apps/api/src/routes/combat.ts
index f083aae..1aa0aba 100644
--- a/apps/api/src/routes/combat.ts
+++ b/apps/api/src/routes/combat.ts
@@ -797,7 +797,6 @@ combatRouter.post('/start', async (req, res, next) => {
         zoneId,
         mobTemplateId: prefixedMob.id,
         mobPrefix,
-        mobName: baseMob.name,
         mobDisplayName: prefixedMob.mobDisplayName,
         encounterSiteId: consumedEncounterSiteId,
         encounterSiteCleared,

diff --git a/apps/api/src/routes/player.ts b/apps/api/src/routes/player.ts
index ddcd841..aee8832 100644
--- a/apps/api/src/routes/player.ts
+++ b/apps/api/src/routes/player.ts
@@ -37,6 +37,7 @@ playerRouter.get('/', async (req, res, next) => {
         attributePoints: true,
         attributes: true,
         autoPotionThreshold: true,
+        tutorialStep: true,
         activeTitle: true,
       },
     });
@@ -151,6 +152,50 @@ playerRouter.patch('/settings', async (req, res, next) => {
   }
 });

+const tutorialSchema = z.object({
+  step: z.number().int().min(-1).max(8),
+});
+
+playerRouter.patch('/tutorial', async (req, res, next) => {
+  try {
+    const playerId = req.player!.playerId;
+    const body = tutorialSchema.parse(req.body);
+
+    const player = await prismaAny.player.findUnique({
+      where: { id: playerId },
+      select: { tutorialStep: true },
+    });
+
+    if (!player) throw new AppError(404, 'Player not found', 'NOT_FOUND');
+
+    // Allow skip (-1) from any state, or advance by exactly 1
+    const isSkip = body.step === -1;
+    const isNextStep = body.step === player.tutorialStep + 1;
+
+    if (!isSkip && !isNextStep) {
+      throw new AppError(400, 'Invalid tutorial step', 'INVALID_STEP');
+    }
+
+    // Don't allow advancing past completed
+    if (player.tutorialStep >= 8 && !isSkip) {
+      throw new AppError(400, 'Tutorial already completed', 'TUTORIAL_COMPLETE');
+    }
+
+    await prismaAny.player.update({
+      where: { id: playerId },
+      data: { tutorialStep: body.step },
+    });
+
+    res.json({ tutorialStep: body.step });
+  } catch (err) {
+    next(err);
+  }
+});

diff --git a/apps/api/src/routes/zones.ts b/apps/api/src/routes/zones.ts
index 0ecdd63..e2c826a 100644
--- a/apps/api/src/routes/zones.ts
+++ b/apps/api/src/routes/zones.ts
@@ -412,7 +412,7 @@ zonesRouter.post('/travel', async (req, res, next) => {
               type: 'ambush_victory',
               description: `Ambushed by ${prefixedMob.mobDisplayName}! You defeated it. (+${xpGain} XP)`,
               details: {
-                mobName: baseMob.name,
+                mobName: prefixedMob.mobDisplayName,
                 mobDisplayName: prefixedMob.mobDisplayName,
                 outcome: combatResult.outcome,
                 playerMaxHp: combatResult.combatantAMaxHp,
@@ -472,7 +472,7 @@ zonesRouter.post('/travel', async (req, res, next) => {
                 type: 'ambush_defeat',
                 description: `Ambushed by ${prefixedMob.mobDisplayName}! You were knocked out.`,
                 details: {
-                  mobName: baseMob.name,
+                  mobName: prefixedMob.mobDisplayName,
                   mobDisplayName: prefixedMob.mobDisplayName,
                   outcome: combatResult.outcome,
                   playerMaxHp: combatResult.combatantAMaxHp,
@@ -562,7 +562,7 @@ zonesRouter.post('/travel', async (req, res, next) => {
                 type: 'ambush_defeat',
                 description: `Ambushed by ${prefixedMob.mobDisplayName}! You escaped with ${currentHp} HP.`,
                 details: {
-                  mobName: baseMob.name,
+                  mobName: prefixedMob.mobDisplayName,
                   mobDisplayName: prefixedMob.mobDisplayName,

diff --git a/apps/api/src/services/zoneDiscoveryService.ts b/apps/api/src/services/zoneDiscoveryService.ts
index cc18b2f..fc3fc30 100644
--- a/apps/api/src/services/zoneDiscoveryService.ts
+++ b/apps/api/src/services/zoneDiscoveryService.ts
@@ -31,6 +31,101 @@ export async function ensureStarterDiscoveries(playerId: string): Promise<void>
   });
 }

+/** Seed starter resource nodes and an encounter site for a new player in the first wild zone. */
+export async function ensureStarterEncounterAndNodes(playerId: string): Promise<void> {
+  const starterTown = await db.zone.findFirst({ where: { isStarter: true }, select: { id: true } });
+  if (!starterTown) return;
+
+  const connections = await db.zoneConnection.findMany({
+    where: { fromId: starterTown.id },
+    select: { toId: true },
+  });
+  if (connections.length === 0) return;
+
+  const wildZone = await db.zone.findFirst({
+    where: {
+      id: { in: connections.map((c: { toId: string }) => c.toId) },
+      zoneType: 'wild',
+    },
+    select: { id: true },
+  });
+  if (!wildZone) return;
+
+  const oreNode = await db.resourceNode.findFirst({
+    where: { zoneId: wildZone.id, resourceType: 'Copper Ore' },
+    select: { id: true },
+  });
+  const logNode = await db.resourceNode.findFirst({
+    where: { zoneId: wildZone.id, resourceType: 'Oak Log' },
+    select: { id: true },
+  });
+
+  const nodeData: Array<{ playerId: string; resourceNodeId: string; remainingCapacity: number; decayedCapacity: number }> = [];
+  if (oreNode) nodeData.push({ playerId, resourceNodeId: oreNode.id, remainingCapacity: 6, decayedCapacity: 0 });
+  if (logNode) nodeData.push({ playerId, resourceNodeId: logNode.id, remainingCapacity: 6, decayedCapacity: 0 });
+
+  if (nodeData.length > 0) {
+    const existing = await db.playerResourceNode.findMany({
+      where: {
+        playerId,
+        resourceNodeId: { in: nodeData.map((n: { resourceNodeId: string }) => n.resourceNodeId) },
+      },
+      select: { resourceNodeId: true },
+    });
+    const existingIds = new Set(existing.map((e: { resourceNodeId: string }) => e.resourceNodeId));
+    const toCreate = nodeData.filter((n) => !existingIds.has(n.resourceNodeId));
+    if (toCreate.length > 0) {
+      await db.playerResourceNode.createMany({ data: toCreate });
+    }
+  }
+
+  const existingSite = await db.encounterSite.findFirst({
+    where: { playerId, zoneId: wildZone.id },
+    select: { id: true },
+  });
+  if (existingSite) return;
+
+  const zoneMobFamily = await db.zoneMobFamily.findFirst({
+    where: { zoneId: wildZone.id },
+    orderBy: { discoveryWeight: 'desc' },
+    select: { mobFamilyId: true, mobFamily: { select: { name: true, siteNounSmall: true } } },
+  });
+  if (!zoneMobFamily) return;
+
+  const trashMembers = await db.mobFamilyMember.findMany({
+    where: { mobFamilyId: zoneMobFamily.mobFamilyId, role: 'trash' },
+    select: { mobTemplateId: true },
+    take: 2,
+  });
+  if (trashMembers.length === 0) return;
+
+  const mobs = trashMembers.map((m: { mobTemplateId: string }, i: number) => ({
+    slot: i,
+    mobTemplateId: m.mobTemplateId,
+    role: 'trash',
+    prefix: null,
+    status: 'alive',
+  }));
+
+  const siteName = `Small ${zoneMobFamily.mobFamily.name} ${zoneMobFamily.mobFamily.siteNounSmall}`;
+
+  await db.encounterSite.create({
+    data: {
+      playerId,
+      zoneId: wildZone.id,
+      mobFamilyId: zoneMobFamily.mobFamilyId,
+      name: siteName,
+      size: 'small',
+      mobs: { mobs },
+    },
+  });
+}

diff --git a/apps/web/src/app/game/page.tsx b/apps/web/src/app/game/page.tsx
index 5f04aa1..da03655 100644
--- a/apps/web/src/app/game/page.tsx
+++ b/apps/web/src/app/game/page.tsx
@@ -260,6 +268,7 @@ export default function GamePage() {
     handleClaimAchievement,
     handleSetActiveTitle,
     loadAchievements,
+    tutorialStep, skipTutorial, advanceTutorial,
   } = useGameController({ isAuthenticated });

+  const tutorialPulseTabs = React.useMemo(() => {
+    if (!isTutorialActive(tutorialStep)) return undefined;
+    const stepDef = TUTORIAL_STEPS[tutorialStep];
+    if (!stepDef?.pulseTab) return undefined;
+    return new Set([stepDef.pulseTab]);
+  }, [tutorialStep]);
+
+        <TutorialBanner
+          tutorialStep={tutorialStep}
+          onSkip={skipTutorial}
+        />
+
+        pulseTabs={tutorialPulseTabs}
+      />
+      <TutorialDialog
+        tutorialStep={tutorialStep}
+        onDismiss={() => {
+          if (tutorialStep === TUTORIAL_STEP_WELCOME) {
+            advanceTutorial(TUTORIAL_STEP_WELCOME);
+          } else if (tutorialStep === TUTORIAL_STEP_DONE) {
+            advanceTutorial(TUTORIAL_STEP_DONE);
+          }
+        }}
+      />

diff --git a/apps/web/src/app/game/useGameController.ts b/apps/web/src/app/game/useGameController.ts
index 9871675..9d66d17 100644
--- a/apps/web/src/app/game/useGameController.ts
+++ b/apps/web/src/app/game/useGameController.ts
@@ -1,4 +1,20 @@
 import { useCallback, useEffect, useRef, useState } from 'react';
+import { updateTutorialStep } from '@/lib/api';
+import {
+  TUTORIAL_STEP_WELCOME, TUTORIAL_STEP_EXPLORE, TUTORIAL_STEP_COMBAT,
+  TUTORIAL_STEP_GATHER, TUTORIAL_STEP_TRAVEL, TUTORIAL_STEP_CRAFT,
+  TUTORIAL_STEP_EQUIP, TUTORIAL_STEP_DONE, TUTORIAL_COMPLETED, TUTORIAL_SKIPPED,
+  isTutorialActive, TUTORIAL_STEPS, type BottomTab,
+} from '@/lib/tutorial';

+  const [tutorialStep, setTutorialStep] = useState<number>(TUTORIAL_COMPLETED);

+  setTutorialStep(playerRes.data.player.tutorialStep ?? TUTORIAL_COMPLETED);

+  const advanceTutorial = useCallback(async (fromStep: number) => {
+    if (tutorialStep !== fromStep) return;
+    const nextStep = fromStep + 1;
+    const res = await updateTutorialStep(nextStep);
+    if (res.data) setTutorialStep(res.data.tutorialStep);
+  }, [tutorialStep]);
+
+  const skipTutorial = useCallback(async () => {
+    const res = await updateTutorialStep(TUTORIAL_SKIPPED);
+    if (res.data) setTutorialStep(res.data.tutorialStep);
+  }, []);

+      advanceTutorial(TUTORIAL_STEP_EXPLORE);   // after exploration
+      advanceTutorial(TUTORIAL_STEP_COMBAT);     // after combat
+      advanceTutorial(TUTORIAL_STEP_GATHER);     // after gathering
+      advanceTutorial(TUTORIAL_STEP_CRAFT);      // after crafting
+      advanceTutorial(TUTORIAL_STEP_EQUIP);      // after equipping
+      if (data.zone.zoneType === 'town') advanceTutorial(TUTORIAL_STEP_TRAVEL); // after travel to town

diff --git a/apps/web/src/lib/tutorial.ts b/apps/web/src/lib/tutorial.ts
new file mode 100644
--- /dev/null
+++ b/apps/web/src/lib/tutorial.ts
@@ -0,0 +1,89 @@
+export const TUTORIAL_STEP_WELCOME = 0;
+export const TUTORIAL_STEP_EXPLORE = 1;
+export const TUTORIAL_STEP_COMBAT = 2;
+export const TUTORIAL_STEP_GATHER = 3;
+export const TUTORIAL_STEP_TRAVEL = 4;
+export const TUTORIAL_STEP_CRAFT = 5;
+export const TUTORIAL_STEP_EQUIP = 6;
+export const TUTORIAL_STEP_DONE = 7;
+export const TUTORIAL_COMPLETED = 8;
+export const TUTORIAL_SKIPPED = -1;
+
+export interface TutorialStepDef {
+  banner: string;
+  dialog: { title: string; body: string };
+  pulseTab: BottomTab | null;
+}
+
+export const TUTORIAL_STEPS: Record<number, TutorialStepDef> = {
+  // 8 step definitions (0-7) with banner, dialog, and pulseTab for each
+};
+
+export function isTutorialActive(step: number): boolean {
+  return step >= 0 && step < TUTORIAL_COMPLETED;
+}

diff --git a/packages/database/prisma/migrations/20260220180951_add_tutorial_step/migration.sql b/packages/database/prisma/migrations/20260220180951_add_tutorial_step/migration.sql
new file mode 100644
--- /dev/null
+++ b/packages/database/prisma/migrations/20260220180951_add_tutorial_step/migration.sql
@@ -0,0 +1,4 @@
+ALTER TABLE "players" ADD COLUMN "tutorial_step" INTEGER NOT NULL DEFAULT 0;
+UPDATE "players" SET "tutorial_step" = 8 WHERE "tutorial_step" = 0;

diff --git a/packages/database/prisma/schema.prisma b/packages/database/prisma/schema.prisma
index 78d5f02..4144c0a 100644
+  tutorialStep    Int      @default(0) @map("tutorial_step")
```

## Additional Context

- The project is a turn-based RPG monorepo (Express API + Next.js frontend + shared packages)
- `prisma as unknown as any` (`db`) is used in zoneDiscoveryService because the Prisma client types may not be regenerated
- The tutorial is an 8-step guided flow: Welcome → Explore → Combat → Gather → Travel → Craft → Equip → Done
- Resource nodes decay over time; the seeded nodes start with 0 decay
- Encounter sites are per-player and consumed as mobs are defeated
