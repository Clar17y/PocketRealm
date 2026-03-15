# Code Health Audit: `apps/api/src/routes/crafting/recipes.ts`

**Date:** 2026-03-15 10:41:22
**Auditor:** Automated Loop

## File Audited
`apps/api/src/routes/crafting/recipes.ts`

## Findings

### Type Safety
- [high] **`resultTemplate: any` in inline Prisma result cast (line 56)** — The `prisma.craftingRecipe.findMany({ include: { resultTemplate: true } })` result is cast to an inline type where `resultTemplate` is typed as `any`. This makes the `r.resultTemplate` access on line 78 (passed directly into the response) completely untyped. Same pattern as `crafting/craft.ts` (line 69). — **Suggested fix:** Let Prisma's inferred type flow through, or define an interface for the recipe with included template.
- [low] **Redundant `as Promise<Array<{ recipeId: string }>>` cast (line 24)** — The Prisma query with `select: { recipeId: true }` already infers this exact shape. The cast is unnecessary noise. — **Suggested fix:** Remove the cast.

### Error Handling
No issues found. Handler wrapped in `asyncHandler`. Service delegation and parallel queries via `Promise.all`.

### Dead Code
No issues found.

### Unused Exports
No issues found. `recipesRouter` is imported by `apps/api/src/routes/crafting.ts`.

## Summary
2 findings: 0 critical, 1 high, 0 medium, 1 low
