# Auth Pages Visual Redesign

**Goal:** Replace the plain CSS module styling on register and login pages with Tailwind + `--rpg-*` theme, matching the landing page aesthetic. Full-screen zone art backgrounds with form cards.

## Layout

Both pages share the same structure:
- Full-screen zone art background via `next/image` with `fill` + `priority`
- Gradient overlay: `from-black/60 via-black/40 to-[var(--rpg-background)]`
- Centered semi-transparent card: `bg-[var(--rpg-surface)]/90 border border-[var(--rpg-border)] rounded-xl backdrop-blur-sm`
- Card max-width ~400px, padding responsive (`p-6 md:p-8`)

## Per-Page Details

**Register** (`/register`):
- Background: `zone_millbrook.png` (starting town — "begin your adventure")
- Title: "Create Your Character" in gold
- Fields: username, email, password (existing validation unchanged)
- Submit: PixelButton primary "Begin Adventure"
- Footer link: "Already playing? Log in" → `/login`

**Login** (`/login`):
- Background: `zone_forest_edge.png` (returning to the world)
- Title: "Welcome Back" in gold
- Fields: email, password (existing validation unchanged)
- Submit: PixelButton primary "Enter World"
- Footer link: "New here? Create an account" → `/register`

## Styling

- Labels: `text-sm text-[var(--rpg-text-secondary)]`
- Inputs: `bg-[var(--rpg-background)] border border-[var(--rpg-border)] text-[var(--rpg-text-primary)]` with focus ring `focus:border-[var(--rpg-blue-light)]`
- Error text: `text-[var(--rpg-red)]`
- All CSS module references removed, `login/page.module.css` deleted

## What Doesn't Change

- Form logic, state, validation, auth flow, redirects — all stays identical
- `useAuth` hook usage
- API calls (`register()`, `login()`)
