# In-Game Changelog — Design

## Goal

Players see what's new when they log in and can re-read patch notes anytime.

## Decisions

- **Trigger**: Auto-popup on login when unseen updates exist + always accessible via header dropdown
- **Content source**: TypeScript array in repo (`apps/web/src/lib/changelog.ts`), updated with each deploy
- **UI**: Full-screen modal overlay matching existing RPG modal pattern
- **Entry format**: Narrative — version, date, title, short conversational paragraph
- **Seen tracking**: `lastSeenChangelog` in localStorage (no backend needed)

## Data Shape

```ts
interface ChangelogEntry {
  version: string;    // e.g. "0.12"
  date: string;       // e.g. "2026-02-23"
  title: string;      // e.g. "Guilds & Jewellery"
  summary: string;    // 2-3 sentence narrative
}
```

Array in `changelog.ts`, newest first.

## Seen Tracking

Compare `localStorage.getItem('lastSeenChangelog')` against `changelog[0].version`. If different → auto-show modal on game load. Dismissing updates localStorage.

## Modal

- Full-screen overlay: `fixed inset-0 z-50 flex items-center justify-center bg-black/70`
- Gold-bordered card matching existing RPG modals (LowHpWarningDialog, TutorialDialog)
- Latest entry shown prominently (title + date + summary)
- Scrollable list of older entries below, slightly dimmed
- "Got it" button dismisses and writes `lastSeenChangelog`

## Header Access

- "What's New" item in header username dropdown (alongside Settings, Logout)
- Notification dot when unseen updates exist
- Opens the same modal

## Scope

- Zero backend changes — no API, DB, or migrations
- Pure frontend: one data file, one modal component, minor wiring into game controller and header dropdown
