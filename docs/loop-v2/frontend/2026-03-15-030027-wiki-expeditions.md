# Frontend Audit: Wiki Expeditions Page

**Component Audited:** `apps/web/src/app/wiki/bosses/expeditions/page.tsx` (272 lines)
**Date:** 2026-03-15

---

## Accessibility

No issues found. The page uses semantic HTML (`<h2>`, `<h3>`, `<table>`, `<ul>`, `<ol>`, `<p>`) consistently. Tables have `<thead>`/`<tbody>`/`<th>` structure. All content is text-based with no interactive elements requiring ARIA.

---

## Component Duplication

No issues found. The page correctly uses shared wiki components (`WikiSection`, `FormulaBlock`, `ConstantsTable`) and derives all values from `EXPEDITION_CONSTANTS` rather than hardcoding.

---

## State Issues

No issues found. This is a server component with no client-side state — purely static content derived from shared constants.

---

## UX Issues

No issues found. Well-structured reference documentation with clear sections, data tables driven by constants, and related page links.
