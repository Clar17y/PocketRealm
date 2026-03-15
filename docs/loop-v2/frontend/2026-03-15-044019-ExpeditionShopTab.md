# Frontend Audit: ExpeditionShopTab

**Component Audited:** `apps/web/src/components/guild/ExpeditionShopTab.tsx` (214 lines)
**Date:** 2026-03-15

---

## Accessibility

No issues found. Buttons have clear text labels, token balance is visible, and item info is text-based.

---

## Component Duplication

No issues found. The set gear shop is unique — no other component renders expedition shop items.

---

## State Issues

### 1. `loadShop` and `handlePurchase` silently swallow network errors
**Severity:** medium
**Lines:** 93-101, 106-117

Both functions have no `catch` block. If `getExpeditionShop()` or `purchaseExpeditionItem()` throws (network error), the promise rejects unhandled. The `finally` block runs `setLoading(false)` / `setPurchasing(null)` correctly, but the user gets no feedback about the failure.

**Suggested Fix:** Add catch blocks:
```tsx
const loadShop = useCallback(async () => {
  setLoading(true);
  try {
    const res = await getExpeditionShop();
    if (res.error) { setError(res.error.message); return; }
    setShopData(res.data ?? null);
  } catch (err: unknown) {
    setError(err instanceof Error ? err.message : 'Failed to load shop');
  } finally {
    setLoading(false);
  }
}, [setError]);
```
Same pattern for `handlePurchase`.

---

## UX Issues

No issues found. Clean layout with token balance, set bonus descriptions, per-item stats, and proper affordability checks. The `loading && !shopData` guard prevents flashing on refresh.
