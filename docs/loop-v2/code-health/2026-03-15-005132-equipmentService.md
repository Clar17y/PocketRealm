# Code Health Audit: `apps/api/src/services/equipmentService.ts`

**Date:** 2026-03-15 00:51:32
**Auditor:** Automated Loop

## File Audited
`apps/api/src/services/equipmentService.ts`

## Findings

### Type Safety
- [low] **JSON column casts with proper runtime validation (lines 68-69)** — `baseStats` and `bonusStats` are cast from Prisma JSON columns to `Record<string, unknown> | null | undefined`. However, unlike other services, every field is then validated with `typeof stats.X === 'number'` (lines 74-85) before use. This is the **correct** pattern for handling JSON columns — the cast is safe because the runtime checks prevent bad data from propagating. Noted as informational rather than a deficiency. — **No fix needed.** This is the reference pattern other services should follow.

### Error Handling
No issues found. Comprehensive validation in `equipItem`: ownership, item type, equipment slot, stack size, skill/level requirements. Defensive `ensureEquipmentSlots` auto-creates missing slot rows.

### Dead Code
No issues found.

### Unused Exports
- [low] **`isSkillType` exported but never imported in production code (line 21)** — Only used internally on line 138. No other file imports it. — **Suggested fix:** Remove `export` keyword. If needed externally in the future, re-export it then.

## Summary
1 finding: 0 critical, 0 high, 0 medium, 1 low
