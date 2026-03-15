# Code Health Audit: `apps/api/src/routes/exploration/helpers.ts`

**Date:** 2026-03-15 11:41:53
**Auditor:** Automated Loop

## File Audited
`apps/api/src/routes/exploration/helpers.ts`

## Findings

### Type Safety
- [low] **`(item as Record<string, unknown>)[weightKey]` dynamic key access in `pickWeighted` (line 106)** — The `weightKey: string` parameter provides no compile-time validation that the key exists on `T`. If called with a typo or wrong key, the fallback `defaultWeight` silently kicks in. — **Suggested fix:** Use a callback-based approach (which `pickWeightedGeneric` already supports) and remove this wrapper, or constrain `weightKey` to `keyof T`.

### Error Handling
No issues found.

### Dead Code
- [low] **`getEncounterRange` exported but never used anywhere (line 142)** — Not imported by `start.ts`, `estimate.ts`, or any other file. Not used internally either. Completely dead code. — **Suggested fix:** Remove the function.

### Unused Exports
- [low] **`pickFamilyMemberByRole` exported but only used internally (line 158)** — Called by `buildEncounterSiteMobs` (line 218) but never imported externally. — **Suggested fix:** Remove `export` keyword.
- [low] **`NarrativeEventType` exported but only used internally (line 35)** — Referenced by the `NarrativeEvent` interface (line 46) but never imported externally — `start.ts` imports `NarrativeEvent` but not `NarrativeEventType`. — **Suggested fix:** Remove `export` keyword.
- [low] **`EncounterMobRole` and `EncounterMobStatus` type re-exports never imported externally (line 33)** — Re-exported from `@pocketrealm/shared`, but no sibling file imports these types from `./helpers`. `start.ts` imports `EncounterSiteSize` but not the other two. — **Suggested fix:** Remove the unused re-exports.

## Summary
5 findings: 0 critical, 0 high, 0 medium, 5 low
