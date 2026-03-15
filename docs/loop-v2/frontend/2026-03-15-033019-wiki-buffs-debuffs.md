# Frontend Audit: Wiki Buffs & Debuffs Page

**Component Audited:** `apps/web/src/app/wiki/combat/buffs-debuffs/page.tsx` (232 lines)
**Date:** 2026-03-15

---

## Accessibility

No issues found. Semantic HTML throughout — proper heading hierarchy, `<table>` with `<thead>`/`<tbody>`/`<th>`, `<ul>`/`<ol>` for lists. All data tables are data-driven from constants.

---

## Component Duplication

No issues found. Correctly uses shared wiki components (`WikiSection`, `FormulaBlock`, `ConstantsTable`). Tables are data-driven from `BASE_ACTION_DEFINITIONS`.

---

## State Issues

No issues found. Server component with no client-side state. All data derived at module level from shared constants.

---

## UX Issues

No issues found. Well-structured reference page with clear formula blocks, action tables grouped by type (buff/debuff/DoT/HoT), and constants reference.
