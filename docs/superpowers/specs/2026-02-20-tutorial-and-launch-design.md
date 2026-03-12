# Tutorial System & Friends Launch

## Summary

Interactive tutorial for new players + deployment to get the game in front of friends. Tutorial is a linear 8-step guided experience teaching the core loop: explore → fight → gather → travel → craft → equip.

## Design Decisions

| Decision | Choice |
|---|---|
| Tutorial style | Guided, non-blocking: banner + tab pulse + step dialog |
| Steps | 8 linear steps covering the core gameplay loop |
| Starting zone | Change default to Forest Edge (wild) instead of town |
| Data model | Single `tutorialStep` integer on Player model |
| Step advancement | Frontend detects completion triggers, calls API to persist |
| Skip | Always available; sets step to -1, hides all tutorial UI |
| Existing players | Migration sets tutorialStep=8 (completed) for all existing players |
| Deployment | Neon (DB) + Render (API) + Vercel (web) + Upstash (Redis) |

---

## Tutorial Flow

| Step | Screen | Goal | Completion Trigger |
|------|--------|------|-------------------|
| 1 | Dashboard | Understand turns & HP | Dismiss welcome dialog |
| 2 | Exploration | Invest turns, discover things | First exploration completes |
| 3 | Combat | Fight at encounter site | First combat completes |
| 4 | Gathering | Mine resources | First mining action completes |
| 5 | Zone Map | Travel to town for crafting | Arrive at a town zone |
| 6 | Crafting | Craft first item | Any craft succeeds |
| 7 | Equipment | Equip item | Any equip succeeds |
| 8 | Dashboard | Tutorial complete | Auto after step 7 |

---

## UI Components

### Tutorial Banner

Persistent slim banner below the app header. Shows current step's one-line instruction + "Skip Tutorial" button. Visible only while tutorial is active (step 0-7).

Banner text per step:

| Step | Text |
|------|------|
| 1 | Welcome! You have **86,400 turns** to spend. Let's learn the basics. |
| 2 | Head to the **Explore** tab and invest some turns to discover the area. |
| 3 | You found an encounter site! Go to **Combat** to fight the mobs there. |
| 4 | Try **mining** some resources. Open the Explore tab and select Gather. |
| 5 | Travel to a **town** to craft gear. Open the Map from the Home tab. |
| 6 | You're in town! Open **Crafting** to make something from your materials. |
| 7 | Nice! Now **equip** your new gear from the Inventory tab. |
| 8 | Tutorial complete! You've learned the core loop. Good luck! |

### Tab Pulse

Relevant bottom nav tab gets a CSS pulse animation (glowing ring) pointing the player to the right tab. Stops pulsing when they navigate there.

| Step | Pulsing Tab |
|------|-------------|
| 2 | Explore |
| 3 | Combat |
| 4 | Explore |
| 5 | Home (for zone map sub-tab) |
| 6 | Explore (for crafting sub-tab) |
| 7 | Inventory |

### Step Dialog

Brief modal dialog shown once when a step activates. 2-3 sentences of context + "Got it" button. Provides the deeper explanation; the banner is just the one-liner reminder.

---

## Data Model

### Player model change

```
tutorialStep  Int  @default(0)  @map("tutorial_step")
```

Values:
- `0` = step 1 (welcome, tutorial active)
- `1-7` = on that step number
- `8` = completed
- `-1` = skipped

### Starting zone change

Registration flow sets `currentZoneId` to Forest Edge zone ID instead of current town default.

### API endpoint

```
PATCH /api/v1/player/tutorial
Body: { step: number }
```

Validates step is the next valid step (current + 1) or -1 (skip). Returns updated player.

### Migration

- Add `tutorial_step` column to players table, default 0
- Set `tutorial_step = 8` for all existing players
- Update default starting zone in registration service

---

## Step Completion Detection

All triggers in `useGameController`:

| Step | Handler | Condition |
|------|---------|-----------|
| 1 | Welcome dialog "Got it" click | Always |
| 2 | `handleStartExploration` success | API returns results |
| 3 | `handleStartCombat` success | API returns combat result |
| 4 | `handleMine` success | API returns gathering result |
| 5 | `handleTravel` success | Player's new zone is type "town" |
| 6 | `handleCraft` success | API returns crafted item |
| 7 | `handleEquip` success | API confirms equip |
| 8 | Automatic | After step 7 completes |

Edge cases:
- Exploration finds no encounter sites → step 2 still completes, step 3 banner says to explore more
- Existing players → migration sets step 8
- Skip → sets -1, all tutorial UI disappears

---

## Deployment Setup

| Service | Platform | Config |
|---------|----------|--------|
| Database | Neon | Create project, run `npm run db:migrate`, `npm run db:seed` |
| Backend | Render | Web service, `npm install && npm run build:api`, `npm run start:api` |
| Frontend | Vercel | Connect repo, `NEXT_PUBLIC_API_URL` env var |
| Cache | Upstash | Redis instance, connection string in `REDIS_URL` |

Env vars for Render: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `PORT=4000`, `CORS_ORIGIN=<vercel-url>`, `NODE_ENV=production`

---

## Full Work Breakdown

| Track | Item | Size |
|-------|------|------|
| Tutorial | DB migration (tutorialStep + starting zone) | S |
| Tutorial | `PATCH /player/tutorial` endpoint | S |
| Tutorial | TutorialBanner component | M |
| Tutorial | StepDialog component (8 dialogs) | M |
| Tutorial | Tab pulse CSS animation | S |
| Tutorial | Controller integration (triggers + advancement) | M |
| Pre-launch | Finalize + merge early-game difficulty | In progress |
| Deploy | Neon DB setup + migrate + seed | S |
| Deploy | Render backend | S |
| Deploy | Upstash Redis | S |
| Deploy | Vercel frontend | S |
