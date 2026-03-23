# Auth Hardening Design Spec

## Overview

Strengthen the authentication system for public release: password strength enforcement, optional email verification with Champion trial reward, password reset for verified users, account lockout, and email change support.

## Context

Current auth system is functional (bcrypt, JWT refresh rotation, rate limiting) but lacks password strength rules, email verification, password recovery, and account lockout. These are table stakes for a public launch.

## Decisions

- **Email verification**: optional/deferred — users play immediately, verify when ready
- **Verification reward**: 3-day Champion subscription trial (one-time per account)
- **Password strength**: min 10 chars + top-1000 common password blocklist (NIST-aligned)
- **Password reset**: gated behind email verification (incentive to verify)
- **Account lockout**: 5 failed attempts → 15-minute lock, tracked in Redis
- **Email service**: Resend SDK, sending from `noreply@pocketrealm.gg`
- **Email change**: supported in-game, resets verification status
- **Subscription model**: aligns with existing Champion subscription spec (`2026-02-23-premium-subscription-design.md`). Uses `isPremium` + `premiumExpiresAt` fields on Player. This spec adds those fields ahead of the Stripe integration; the premium spec remains canonical for the full billing flow.
- **Existing users**: new password minimum (10 chars) applies only to new registrations, password resets, and future password changes. Existing users with 8-9 character passwords are unaffected.

## Database Changes

### Player model — new columns

| Column | Type | Default | Purpose |
|--------|------|---------|---------|
| `emailVerified` | Boolean | false | Whether email is confirmed |
| `premiumTrialClaimed` | Boolean | false | Whether the one-time email verification Champion trial has been claimed |
| `isPremium` | Boolean | false | Runtime flag for Champion subscription (from premium spec) |
| `premiumExpiresAt` | DateTime? | null | When current Champion subscription lapses (from premium spec) |

`isPremium` and `premiumExpiresAt` are defined in the existing Champion subscription spec. We add them here so the verification reward works. The Stripe-specific fields (`stripeCustomerId`, `stripeSubscriptionId`) are deferred to the Stripe integration project.

### EmailVerificationToken — new table

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `playerId` | String (FK → Player) | |
| `tokenHash` | String (unique) | SHA-256 hash of the raw token |
| `expiresAt` | DateTime | 24 hours from creation |
| `createdAt` | DateTime | |

One active token per user. Creating a new one deletes the old.

### PasswordResetToken — new table

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | PK |
| `playerId` | String (FK → Player) | |
| `tokenHash` | String (unique) | SHA-256 hash of the raw token |
| `expiresAt` | DateTime | 1 hour from creation |
| `usedAt` | DateTime? | Set when consumed |
| `createdAt` | DateTime | |

One active token per user. Creating a new one deletes the old.

### Token cleanup

Expired tokens accumulate from users who never complete verification or reset. A daily scheduled job (or cleanup at token creation time) deletes rows where `expiresAt < now()` from both token tables to prevent unbounded growth.

## Email Service

- **Package**: `resend` SDK added to `apps/api`
- **Module**: `apps/api/src/services/emailService.ts`
- **Config**: `RESEND_API_KEY` and `APP_URL` env vars
- **From**: `noreply@pocketrealm.gg`

### Token generation

- 32 bytes crypto-random, hex-encoded (64 chars)
- Stored in DB as SHA-256 hash (not bcrypt — these are high-entropy random tokens, not passwords; SHA-256 is equally secure and avoids CPU cost on unauthenticated endpoints)
- Raw token only exists in the email link URL

### Token in URL

Tokens are passed as query parameters (e.g., `?token={token}`). This means they may appear in browser history and server access logs. This is acceptable because tokens are single-use and short-lived. The frontend pages consume the token immediately on load and do not persist it in state.

### Email types

**Verification email:**
- Subject: "Verify your email — Pocketrealm"
- Link: `{APP_URL}/verify-email?token={token}`
- Mentions 3-day Champion reward
- Inline HTML, RPG-themed styling

**Password reset email:**
- Subject: "Reset your password — Pocketrealm"
- Link: `{APP_URL}/reset-password?token={token}`
- Mentions 1-hour expiry
- Inline HTML, RPG-themed styling

## API Routes

### New endpoints

#### `POST /auth/verify-email`
- **Auth**: None (public endpoint — users may click the link while logged out or on a different device)
- **Body**: `{ token: string }`
- **Logic**: SHA-256 hash the provided token, look up matching row in `EmailVerificationToken` where not expired. Set `emailVerified = true` on Player. If `premiumTrialClaimed` is false, set `isPremium = true`, `premiumExpiresAt = now + 3 days`, `premiumTrialClaimed = true`. Delete the token.
- **Response**: Success message with Champion reward info (or without if already claimed).
- **Errors**: Invalid/expired token → 400.

#### `POST /auth/resend-verification`
- **Auth**: Required (authenticated endpoint)
- **Rate limit**: 3 per hour per user
- **Logic**: If already verified, return error. Delete existing verification token. Generate new token, store hash, send email.
- **Response**: Success message.

#### `POST /auth/forgot-password`
- **Auth**: None (public endpoint)
- **Rate limit**: 5 per hour per IP + 3 per hour per email address (Redis-backed, prevents email bombing)
- **Body**: `{ email: string }`
- **Logic**: Look up player by email. If exists AND `emailVerified = true`, create `PasswordResetToken` (delete any existing), send reset email. Always return the same success message regardless of whether the email exists or is verified (prevents enumeration).
- **Response**: "If that email is verified with us, we've sent a reset link."

#### `POST /auth/reset-password`
- **Auth**: None (public endpoint)
- **Body**: `{ token: string, password: string }`
- **Logic**: SHA-256 hash the provided token, look up matching row in `PasswordResetToken` where not expired and `usedAt` is null. Validate new password against strength rules. Update player's `passwordHash`. Mark token as used (`usedAt = now()`). Delete all player's refresh tokens (force re-login everywhere).
- **Response**: Success message, redirect to login.
- **Errors**: Invalid/expired/used token → 400. Weak password → 400.

#### `POST /auth/change-email`
- **Auth**: Required
- **Body**: `{ email: string, password: string }`
- **Logic**: Verify current password. Check new email isn't taken. Update email. Set `emailVerified = false`. Delete existing verification tokens. Generate new verification token, send email to new address.
- **Response**: Success message.

#### `POST /auth/change-password`
- **Auth**: Required
- **Body**: `{ currentPassword: string, newPassword: string }`
- **Logic**: Verify current password via bcrypt.compare. Validate new password against strength rules. Update `passwordHash`. Delete all refresh tokens except the current session (force re-login on other devices).
- **Response**: Success message.

### Changes to existing endpoints

#### `POST /auth/register`
- After creating the player, generate a verification token and send the verification email via Resend.
- Fire-and-forget: registration succeeds even if email send fails (log the error).
- Password validation uses new strength rules (min 10 chars, blocklist check).

#### `POST /auth/login`
- After player lookup by email (which already happens): check Redis for lockout. If locked, return 401 "Invalid credentials" (same message as wrong password — prevents enumeration of locked accounts).
- On password failure: atomically increment Redis counter via `INCR` on key `login:lockout:{playerId}`. Set TTL to 15 minutes only on first failure (when INCR returns 1). If count reaches 5, the account is locked for the remaining TTL.
- On success with correct password but account locked: return 423 "Account temporarily locked, try again later." (Only revealed when the attacker already knows the password, so no enumeration risk.)
- On success with correct password and not locked: delete the Redis lockout key.

## Password Validation

Shared utility used by register, reset-password, and change-password:

- **Location**: `apps/api/src/utils/passwordValidation.ts`
- **Rules**:
  - Minimum 10 characters
  - Maximum 100 characters
  - Not in the common-password blocklist (~1000 entries)
- **Blocklist**: Static `Set<string>` loaded from a constants file (`apps/api/src/constants/commonPasswords.ts`)
- **Returns**: `{ valid: boolean, reason?: string }` with user-friendly messages like "Password is too common" or "Password must be at least 10 characters"

## Account Lockout (Redis)

- **Key pattern**: `login:lockout:{playerId}`
- **Value**: Plain integer counter (via Redis `INCR`)
- **TTL**: 15 minutes, set on first failure via `EXPIRE` when `INCR` returns 1 (atomic, no race conditions)
- **Threshold**: 5 failed attempts
- **On failed login**: `INCR` the key. If the result is 1, set TTL. If the result is >= 5, account is locked for remaining TTL.
- **On successful login (not locked)**: `DEL` the key
- **On successful login (locked)**: Return 423, do not delete the key

## Frontend Changes

### New pages

#### `/verify-email`
- Extracts `token` from URL query params
- Calls `POST /auth/verify-email` immediately on load
- Shows success state with Champion reward celebration, or error with option to resend

#### `/forgot-password`
- Email input form
- Calls `POST /auth/forgot-password`
- Shows generic "check your email" message regardless of result

#### `/reset-password`
- Extracts `token` from URL query params
- New password form with strength indicator
- Calls `POST /auth/reset-password`
- Redirects to login on success

### Changes to existing pages

#### Register page
- Password strength indicator (text-based: "too short" / "common password" / "looks good")
- Post-registration note: "Check your email to verify and claim 3 days of Champion!"

#### Login page
- Add "Forgot password?" link below the form

#### In-game
- Dismissable banner for unverified users: "Verify your email to unlock account recovery and get 3 days of Champion"
- Links to resend verification
- Hidden once verified

#### Settings/account (in-game)
- Email change form (requires current password)
- Password change form (requires current password)
- Shows current verification status
- Resend verification button if unverified

## Testing

### API tests

- **Password validation utility**: blocklist rejection, length checks (too short, too long, valid), edge cases
- **Registration**: sends verification email, creates token in DB, password strength enforced
- **Email verification**: valid token → verified + Champion granted, expired token → 400, already verified → error, invalid token → 400, Champion not re-granted on second verification
- **Resend verification**: rate limiting enforced, already-verified rejection
- **Forgot password**: verified user gets email, unverified user doesn't (but same response), nonexistent email returns same response, rate limiting enforced
- **Reset password**: valid flow end-to-end, expired token → 400, used token → 400, weak new password rejected, all refresh tokens cleared on success
- **Change password**: correct current password required, new password strength enforced, other sessions invalidated
- **Login lockout**: locks after 5 failures, correct credentials while locked → 423, unlocks after TTL, clears on successful login when not locked
- **Email change**: requires correct password, resets verification status, sends new verification email, doesn't re-grant Champion if already claimed

### E2E tests

Skipped for now — would require mocked email service. API test coverage is sufficient.

## Out of Scope

- Stripe billing integration (future project — see `2026-02-23-premium-subscription-design.md`)
- HttpOnly cookie migration for token storage
- Two-factor authentication (TOTP/WebAuthn)
- CAPTCHA on registration
- Session management UI (list/revoke sessions)
- Login history / audit logging
