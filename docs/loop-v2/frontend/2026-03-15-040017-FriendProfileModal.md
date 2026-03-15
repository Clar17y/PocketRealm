# Frontend Audit: FriendProfileModal

**Component Audited:** `apps/web/src/components/friends/FriendProfileModal.tsx` (222 lines)
**Date:** 2026-03-15

---

## Accessibility

### 1. Online indicator uses non-standard Tailwind colors
**Severity:** low
**Lines:** 164-166

The online/offline dot uses `bg-green-500` and `bg-gray-500` instead of the RPG theme variables (`var(--rpg-green-light)`, `var(--rpg-text-secondary)`) used everywhere else. However, the adjacent text "Online"/"Offline" provides a non-color alternative, which is good.

**Suggested Fix:** Use `bg-[var(--rpg-green-light)]` and `bg-[var(--rpg-text-secondary)]` for consistency with the FriendsScreen online indicator.

---

## Component Duplication

### 1. Action buttons use raw styled buttons instead of PixelButton
**Severity:** low
**Lines:** 190-215

Four action buttons (Spar, Send Mail, Unfriend, Block) use raw `<button>` elements with inline Tailwind and hardcoded hover colors (`#e4b85b`, `#4899c3`, `#b33`). The rest of the app uses `PixelButton` for all interactive buttons.

**Suggested Fix:** Replace with `<PixelButton variant="gold|primary|danger">` for consistency and to avoid hardcoded color fallbacks.

---

## State Issues

### 1. `handleConfirmAction` silently swallows errors
**Severity:** medium
**Lines:** 91-108

The catch block at line 102-104 is empty with a comment "action failed -- modal will close and parent can handle". But the modal does close (`setConfirmAction(null)` in finally), and the parent has no way to know the action failed since neither `onUnfriend` nor `onBlock` is called on failure. The user gets no feedback.

**Suggested Fix:** Surface the error:
```tsx
} catch (err: unknown) {
  setError(err instanceof Error ? err.message : 'Action failed');
} finally {
  setActionLoading(false);
  setConfirmAction(null);
}
```

---

## UX Issues

No issues found. Good use of `ConfirmModal` for unfriend/block (unlike FriendsScreen's list view which lacks confirmation — see FriendsScreen audit). Proper loading state, error state, close button with `aria-label`, and equipment display with rarity colors.
