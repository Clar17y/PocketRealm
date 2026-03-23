# Auth Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strengthen the auth system for public release — password strength enforcement, optional email verification with 3-day Champion trial reward, password reset for verified users, account lockout, and email/password change support.

**Architecture:** New Prisma models for verification/reset tokens. New columns on Player for premium trial. New services for email (Resend SDK), token management (SHA-256 hashed), and lockout (Redis INCR). Routes extend existing `auth.ts`. Frontend adds verify-email, forgot-password, reset-password pages plus in-game verification banner.

**Important notes for implementers:**
- Line numbers reference the *original* file state. After each task modifies a file, subsequent line numbers shift — use the descriptive context (e.g., "after the Zod schema") to find the right location.
- Test passwords must be >= 10 chars and NOT in the common password blocklist.

**Tech Stack:** Express 4, Prisma 6, Redis 7 (ioredis), Resend SDK, Vitest, Next.js 16

**Spec:** `docs/superpowers/specs/2026-03-23-auth-hardening-design.md`

---

## File Structure

### New files

| File | Responsibility |
|------|---------------|
| `apps/api/src/constants/commonPasswords.ts` | Top-1000 common password blocklist as `Set<string>` |
| `apps/api/src/utils/passwordValidation.ts` | Validate password strength (length + blocklist) |
| `apps/api/src/utils/passwordValidation.test.ts` | Tests for password validation |
| `apps/api/src/services/emailService.ts` | Resend SDK wrapper — send verification & reset emails |
| `apps/api/src/services/emailService.test.ts` | Tests for email service (mocked Resend) |
| `apps/api/src/services/authTokenService.ts` | Generate, hash, store, verify tokens for email verification & password reset |
| `apps/api/src/services/authTokenService.test.ts` | Tests for auth token service |
| `apps/api/src/services/lockoutService.ts` | Redis-based login lockout (INCR + TTL) |
| `apps/api/src/services/lockoutService.test.ts` | Tests for lockout service |
| `apps/web/src/app/verify-email/page.tsx` | Email verification landing page |
| `apps/web/src/app/forgot-password/page.tsx` | Forgot password form |
| `apps/web/src/app/reset-password/page.tsx` | Reset password form |
| `apps/web/src/components/PasswordStrengthIndicator.tsx` | Reusable password strength text indicator |
| `apps/web/src/components/VerificationBanner.tsx` | In-game dismissable verification prompt |

### Modified files

| File | Changes |
|------|---------|
| `packages/database/prisma/schema.prisma` | Add 4 Player columns, 2 new models |
| `apps/api/src/__mocks__/database.ts` | Add mock models for new Prisma tables |
| `apps/api/package.json` | Add `resend` dependency |
| `apps/api/src/routes/auth.ts` | Update register/login, add 6 new endpoints |
| `apps/api/src/routes/auth.test.ts` | Add tests for all new/changed routes |
| `apps/api/src/routes/player.ts` | Add `emailVerified`, `isPremium` to GET /player select |
| `apps/api/src/index.ts` | Add token cleanup scheduled job |
| `apps/web/src/app/login/page.tsx` | Add "Forgot password?" link |
| `apps/web/src/app/register/page.tsx` | Add password strength indicator, post-reg verification note |
| `apps/web/src/lib/api/auth.ts` | Add new API functions |
| `apps/web/src/lib/api/index.ts` | Export new auth functions |
| `apps/web/src/hooks/useAuth.ts` | Add `emailVerified` to Player interface |

---

## Task 1: Database Schema & Migration

**Files:**
- Modify: `packages/database/prisma/schema.prisma:14-139` (Player model) and after line 152 (new models)

- [ ] **Step 1: Add new columns to Player model**

Add after line 22 (`lastActiveAt`):

```prisma
  // Auth hardening
  emailVerified       Boolean   @default(false) @map("email_verified")
  premiumTrialClaimed Boolean   @default(false) @map("premium_trial_claimed")
  isPremium           Boolean   @default(false) @map("is_premium")
  premiumExpiresAt    DateTime? @map("premium_expires_at")
```

Add relation fields inside Player (after `refreshTokens` on line 94):

```prisma
  emailVerificationTokens EmailVerificationToken[]
  passwordResetTokens     PasswordResetToken[]
```

- [ ] **Step 2: Add EmailVerificationToken model**

Add after the `RefreshToken` model (after line 152):

```prisma
model EmailVerificationToken {
  id        String   @id @default(uuid())
  playerId  String   @map("player_id")
  tokenHash String   @unique @map("token_hash") @db.VarChar(64)
  expiresAt DateTime @map("expires_at")
  createdAt DateTime @default(now()) @map("created_at")

  player Player @relation(fields: [playerId], references: [id], onDelete: Cascade)

  @@index([playerId])
  @@map("email_verification_tokens")
}
```

- [ ] **Step 3: Add PasswordResetToken model**

Add after `EmailVerificationToken`:

```prisma
model PasswordResetToken {
  id        String    @id @default(uuid())
  playerId  String    @map("player_id")
  tokenHash String    @unique @map("token_hash") @db.VarChar(64)
  expiresAt DateTime  @map("expires_at")
  usedAt    DateTime? @map("used_at")
  createdAt DateTime  @default(now()) @map("created_at")

  player Player @relation(fields: [playerId], references: [id], onDelete: Cascade)

  @@index([playerId])
  @@map("password_reset_tokens")
}
```

- [ ] **Step 4: Add mock models to test factory**

Add to `apps/api/src/__mocks__/database.ts`, inside the `prisma` object (after line 90, before `$transaction`):

```typescript
  emailVerificationToken: mockModel(),
  passwordResetToken: mockModel(),
```

- [ ] **Step 5: Run migration**

```bash
cd packages/database && npx prisma migrate dev --name auth_hardening
```

Expected: Migration created successfully, Prisma client regenerated. (Worktree DBs use their own `DATABASE_URL`, so this won't affect the main DB.)

- [ ] **Step 6: Verify Prisma client generation**

```bash
npm run db:generate
```

Expected: "Generated Prisma Client"

- [ ] **Step 7: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations/ apps/api/src/__mocks__/database.ts
git commit -m "feat(db): add auth hardening schema — verification tokens, reset tokens, Player premium fields"
```

---

## Task 2: Common Password Blocklist

**Files:**
- Create: `apps/api/src/constants/commonPasswords.ts`

- [ ] **Step 1: Create the blocklist file**

Create `apps/api/src/constants/commonPasswords.ts` containing the top 1000 most common passwords as a `Set<string>`. Source the list from a well-known public list (e.g., SecLists top-1000).

```typescript
/**
 * Top 1000 most common passwords — used to reject weak choices at registration
 * and password reset. Source: SecLists/Passwords/Common-Credentials.
 */
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  'password',
  '123456',
  '12345678',
  '1234567890',
  'qwerty',
  'abc123',
  'password1',
  'password123',
  '111111',
  'iloveyou',
  // ... (include full top-1000 list)
  // The implementer should fetch the actual list from:
  // https://raw.githubusercontent.com/danielmiessler/SecLists/master/Passwords/Common-Credentials/10-million-password-list-top-1000.txt
  // Filter to only include passwords >= 10 chars (shorter ones are already caught by min-length rule)
  // PLUS include the most common short passwords for the blocklist message
]);
```

**Note:** Include ALL 1000 entries regardless of length. The validation function checks length first, so short passwords in the blocklist just serve as defense-in-depth if the min-length ever changes.

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/constants/commonPasswords.ts
git commit -m "feat(auth): add common password blocklist (top 1000)"
```

---

## Task 3: Password Validation Utility (TDD)

**Files:**
- Create: `apps/api/src/utils/passwordValidation.ts`
- Create: `apps/api/src/utils/passwordValidation.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/utils/passwordValidation.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { validatePassword } from './passwordValidation';

describe('validatePassword', () => {
  it('rejects passwords shorter than 10 characters', () => {
    const result = validatePassword('short');
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/at least 10 characters/i);
  });

  it('rejects passwords longer than 100 characters', () => {
    const result = validatePassword('a'.repeat(101));
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/100 characters/i);
  });

  it('rejects common passwords from blocklist', () => {
    const result = validatePassword('password123');
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/too common/i);
  });

  it('rejects common passwords case-insensitively', () => {
    const result = validatePassword('Password123');
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/too common/i);
  });

  it('accepts valid passwords', () => {
    const result = validatePassword('myUniquePassphrase2026');
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('accepts passwords at exactly 10 characters', () => {
    const result = validatePassword('abcdefghij');
    expect(result.valid).toBe(true);
  });

  it('accepts passwords at exactly 100 characters', () => {
    const result = validatePassword('a'.repeat(100));
    expect(result.valid).toBe(true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && npx vitest run src/utils/passwordValidation.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/utils/passwordValidation.ts`:

```typescript
import { COMMON_PASSWORDS } from '../constants/commonPasswords';

export interface PasswordValidationResult {
  valid: boolean;
  reason?: string;
}

const MIN_LENGTH = 10;
const MAX_LENGTH = 100;

export function validatePassword(password: string): PasswordValidationResult {
  if (password.length < MIN_LENGTH) {
    return { valid: false, reason: `Password must be at least ${MIN_LENGTH} characters` };
  }

  if (password.length > MAX_LENGTH) {
    return { valid: false, reason: `Password must be at most ${MAX_LENGTH} characters` };
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { valid: false, reason: 'That password is too common — please choose something less guessable' };
  }

  return { valid: true };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && npx vitest run src/utils/passwordValidation.test.ts
```

Expected: All 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/utils/passwordValidation.ts apps/api/src/utils/passwordValidation.test.ts
git commit -m "feat(auth): add password validation utility with blocklist (TDD)"
```

---

## Task 4: Auth Token Service (TDD)

**Files:**
- Create: `apps/api/src/services/authTokenService.ts`
- Create: `apps/api/src/services/authTokenService.test.ts`

This service handles crypto-random token generation, SHA-256 hashing, and CRUD for `EmailVerificationToken` and `PasswordResetToken` tables.

- [ ] **Step 1: Write the failing tests**

Create `apps/api/src/services/authTokenService.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('@pocketrealm/database', () => import('../__mocks__/database.js'));

import { mockPrisma } from '../__test__/setup';
import {
  generateToken,
  hashToken,
  createEmailVerificationToken,
  verifyEmailToken,
  createPasswordResetToken,
  verifyPasswordResetToken,
} from './authTokenService';

describe('generateToken', () => {
  it('returns a 64-character hex string', () => {
    const token = generateToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates unique tokens', () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
  });
});

describe('hashToken', () => {
  it('returns a 64-character hex SHA-256 hash', () => {
    const hash = hashToken('abc123');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic', () => {
    expect(hashToken('test')).toBe(hashToken('test'));
  });

  it('produces different hashes for different inputs', () => {
    expect(hashToken('a')).not.toBe(hashToken('b'));
  });
});

describe('createEmailVerificationToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.emailVerificationToken = {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: 'tok-1' }),
    };
  });

  it('deletes existing tokens for the player before creating a new one', async () => {
    const { rawToken } = await createEmailVerificationToken('player-1');

    expect(mockPrisma.emailVerificationToken.deleteMany).toHaveBeenCalledWith({
      where: { playerId: 'player-1' },
    });
    expect(mockPrisma.emailVerificationToken.create).toHaveBeenCalled();
    expect(rawToken).toHaveLength(64);
  });
});

describe('verifyEmailToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.emailVerificationToken = {
      findUnique: vi.fn(),
      delete: vi.fn().mockResolvedValue({}),
    };
  });

  it('returns the token record when valid and not expired', async () => {
    const future = new Date(Date.now() + 60_000);
    mockPrisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: 'tok-1',
      playerId: 'player-1',
      expiresAt: future,
    });

    const result = await verifyEmailToken('some-raw-token');
    expect(result).toEqual({ id: 'tok-1', playerId: 'player-1', expiresAt: future });
  });

  it('returns null when token not found', async () => {
    mockPrisma.emailVerificationToken.findUnique.mockResolvedValue(null);
    const result = await verifyEmailToken('bad-token');
    expect(result).toBeNull();
  });

  it('returns null when token is expired', async () => {
    const past = new Date(Date.now() - 60_000);
    mockPrisma.emailVerificationToken.findUnique.mockResolvedValue({
      id: 'tok-1',
      playerId: 'player-1',
      expiresAt: past,
    });

    const result = await verifyEmailToken('expired-token');
    expect(result).toBeNull();
  });
});

describe('verifyPasswordResetToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.passwordResetToken = {
      findUnique: vi.fn(),
    };
  });

  it('returns null when token is already used', async () => {
    mockPrisma.passwordResetToken.findUnique.mockResolvedValue({
      id: 'tok-1',
      playerId: 'player-1',
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: new Date(), // already used
    });

    const result = await verifyPasswordResetToken('used-token');
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && npx vitest run src/services/authTokenService.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/services/authTokenService.ts`:

```typescript
import { randomBytes, createHash } from 'node:crypto';
import { prisma } from '@pocketrealm/database';

const VERIFICATION_TOKEN_TTL_HOURS = 24;
const RESET_TOKEN_TTL_HOURS = 1;

/** Generate a 32-byte crypto-random hex token (64 chars). */
export function generateToken(): string {
  return randomBytes(32).toString('hex');
}

/** SHA-256 hash a raw token for safe DB storage. */
export function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

/** Create a verification token for a player. Deletes any existing token first. */
export async function createEmailVerificationToken(playerId: string): Promise<{ rawToken: string }> {
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + VERIFICATION_TOKEN_TTL_HOURS * 60 * 60 * 1000);

  await prisma.emailVerificationToken.deleteMany({ where: { playerId } });
  await prisma.emailVerificationToken.create({
    data: { playerId, tokenHash, expiresAt },
  });

  return { rawToken };
}

/** Verify a raw email verification token. Returns the record if valid, null otherwise. */
export async function verifyEmailToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
  });

  if (!record || record.expiresAt < new Date()) {
    return null;
  }

  return record;
}

/** Create a password reset token for a player. Deletes any existing token first. */
export async function createPasswordResetToken(playerId: string): Promise<{ rawToken: string }> {
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_HOURS * 60 * 60 * 1000);

  await prisma.passwordResetToken.deleteMany({ where: { playerId } });
  await prisma.passwordResetToken.create({
    data: { playerId, tokenHash, expiresAt },
  });

  return { rawToken };
}

/** Verify a raw password reset token. Returns the record if valid, null otherwise. */
export async function verifyPasswordResetToken(rawToken: string) {
  const tokenHash = hashToken(rawToken);
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash },
  });

  if (!record || record.expiresAt < new Date() || record.usedAt !== null) {
    return null;
  }

  return record;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && npx vitest run src/services/authTokenService.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/authTokenService.ts apps/api/src/services/authTokenService.test.ts
git commit -m "feat(auth): add auth token service for verification and reset tokens (TDD)"
```

---

## Task 5: Email Service (Resend)

**Files:**
- Modify: `apps/api/package.json` (add `resend` dependency)
- Create: `apps/api/src/services/emailService.ts`
- Create: `apps/api/src/services/emailService.test.ts`

- [ ] **Step 1: Install Resend SDK**

```bash
cd apps/api && npm install resend
```

- [ ] **Step 2: Write failing tests**

Create `apps/api/src/services/emailService.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock Resend before importing
vi.mock('resend', () => ({
  Resend: vi.fn().mockImplementation(() => ({
    emails: {
      send: vi.fn().mockResolvedValue({ data: { id: 'email-1' }, error: null }),
    },
  })),
}));

import { sendVerificationEmail, sendPasswordResetEmail } from './emailService';

describe('sendVerificationEmail', () => {
  it('sends an email with the verification link', async () => {
    await expect(
      sendVerificationEmail('user@example.com', 'abc123token', 'TestUser'),
    ).resolves.not.toThrow();
  });
});

describe('sendPasswordResetEmail', () => {
  it('sends an email with the reset link', async () => {
    await expect(
      sendPasswordResetEmail('user@example.com', 'abc123token', 'TestUser'),
    ).resolves.not.toThrow();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd apps/api && npx vitest run src/services/emailService.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

Create `apps/api/src/services/emailService.ts`:

```typescript
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_ADDRESS = process.env.EMAIL_FROM ?? 'noreply@pocketrealm.gg';
const APP_URL = process.env.APP_URL ?? 'http://localhost:3002';

export async function sendVerificationEmail(
  email: string,
  token: string,
  username: string,
): Promise<void> {
  const verifyUrl = `${APP_URL}/verify-email?token=${token}`;

  await resend.emails.send({
    from: FROM_ADDRESS,
    to: email,
    subject: 'Verify your email — Pocketrealm',
    html: `
      <div style="font-family: 'Georgia', serif; max-width: 560px; margin: 0 auto; background: #1a1a2e; color: #e0d4b8; padding: 32px; border-radius: 8px;">
        <h1 style="color: #d4a947; font-size: 24px; margin-bottom: 16px;">Welcome, ${escapeHtml(username)}!</h1>
        <p style="line-height: 1.6;">Verify your email to unlock <strong>account recovery</strong> and claim <strong style="color: #d4a947;">3 days of Champion</strong> — bonus turns, better loot, and more.</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${verifyUrl}" style="display: inline-block; background: #d4a947; color: #1a1a2e; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 16px;">Verify Email</a>
        </div>
        <p style="font-size: 13px; color: #8a8a8a;">This link expires in 24 hours. If you didn't create a Pocketrealm account, ignore this email.</p>
      </div>
    `,
  });
}

export async function sendPasswordResetEmail(
  email: string,
  token: string,
  username: string,
): Promise<void> {
  const resetUrl = `${APP_URL}/reset-password?token=${token}`;

  await resend.emails.send({
    from: FROM_ADDRESS,
    to: email,
    subject: 'Reset your password — Pocketrealm',
    html: `
      <div style="font-family: 'Georgia', serif; max-width: 560px; margin: 0 auto; background: #1a1a2e; color: #e0d4b8; padding: 32px; border-radius: 8px;">
        <h1 style="color: #d4a947; font-size: 24px; margin-bottom: 16px;">Password Reset</h1>
        <p style="line-height: 1.6;">Hi ${escapeHtml(username)}, we received a request to reset your password.</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${resetUrl}" style="display: inline-block; background: #d4a947; color: #1a1a2e; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: bold; font-size: 16px;">Reset Password</a>
        </div>
        <p style="font-size: 13px; color: #8a8a8a;">This link expires in 1 hour. If you didn't request this, ignore this email — your password won't change.</p>
      </div>
    `,
  });
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd apps/api && npx vitest run src/services/emailService.test.ts
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/package.json apps/api/src/services/emailService.ts apps/api/src/services/emailService.test.ts
git commit -m "feat(auth): add email service with Resend SDK for verification and reset emails"
```

---

## Task 6: Lockout Service (TDD)

**Files:**
- Create: `apps/api/src/services/lockoutService.ts`
- Create: `apps/api/src/services/lockoutService.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/api/src/services/lockoutService.test.ts`:

```typescript
import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockRedis = {
  incr: vi.fn(),
  expire: vi.fn(),
  get: vi.fn(),
  del: vi.fn(),
};

vi.mock('../redis', () => ({ redis: mockRedis }));

import { recordFailedLogin, isLockedOut, clearLockout } from './lockoutService';

const PLAYER_ID = 'player-1';

describe('lockoutService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('recordFailedLogin', () => {
    it('increments the counter and sets TTL on first failure', async () => {
      mockRedis.incr.mockResolvedValue(1);

      await recordFailedLogin(PLAYER_ID);

      expect(mockRedis.incr).toHaveBeenCalledWith(`login:lockout:${PLAYER_ID}`);
      expect(mockRedis.expire).toHaveBeenCalledWith(`login:lockout:${PLAYER_ID}`, 900);
    });

    it('does not reset TTL on subsequent failures', async () => {
      mockRedis.incr.mockResolvedValue(3);

      await recordFailedLogin(PLAYER_ID);

      expect(mockRedis.incr).toHaveBeenCalled();
      expect(mockRedis.expire).not.toHaveBeenCalled();
    });
  });

  describe('isLockedOut', () => {
    it('returns false when no key exists', async () => {
      mockRedis.get.mockResolvedValue(null);
      expect(await isLockedOut(PLAYER_ID)).toBe(false);
    });

    it('returns false when attempts < 5', async () => {
      mockRedis.get.mockResolvedValue('4');
      expect(await isLockedOut(PLAYER_ID)).toBe(false);
    });

    it('returns true when attempts >= 5', async () => {
      mockRedis.get.mockResolvedValue('5');
      expect(await isLockedOut(PLAYER_ID)).toBe(true);
    });
  });

  describe('clearLockout', () => {
    it('deletes the lockout key', async () => {
      await clearLockout(PLAYER_ID);
      expect(mockRedis.del).toHaveBeenCalledWith(`login:lockout:${PLAYER_ID}`);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd apps/api && npx vitest run src/services/lockoutService.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `apps/api/src/services/lockoutService.ts`:

```typescript
import { redis } from '../redis';

const LOCKOUT_THRESHOLD = 5;
const LOCKOUT_TTL_SECONDS = 900; // 15 minutes

function lockoutKey(playerId: string): string {
  return `login:lockout:${playerId}`;
}

/** Record a failed login attempt. Sets TTL on first failure. */
export async function recordFailedLogin(playerId: string): Promise<void> {
  const key = lockoutKey(playerId);
  const count = await redis.incr(key);

  // Set TTL only on first failure so the window doesn't keep extending
  if (count === 1) {
    await redis.expire(key, LOCKOUT_TTL_SECONDS);
  }
}

/** Check if a player is currently locked out. */
export async function isLockedOut(playerId: string): Promise<boolean> {
  const count = await redis.get(lockoutKey(playerId));
  return count !== null && parseInt(count, 10) >= LOCKOUT_THRESHOLD;
}

/** Clear lockout after successful login. */
export async function clearLockout(playerId: string): Promise<void> {
  await redis.del(lockoutKey(playerId));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd apps/api && npx vitest run src/services/lockoutService.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/lockoutService.ts apps/api/src/services/lockoutService.test.ts
git commit -m "feat(auth): add Redis-based login lockout service (TDD)"
```

---

## Task 7: Update Register Route

**Files:**
- Modify: `apps/api/src/routes/auth.ts:29-168`

- [ ] **Step 1: Update imports**

At the top of `auth.ts`, add new imports:

```typescript
import { validatePassword } from '../utils/passwordValidation';
import { createEmailVerificationToken } from '../services/authTokenService';
import { sendVerificationEmail } from '../services/emailService';
```

- [ ] **Step 2: Update register Zod schema**

Change line 32 from:
```typescript
  password: z.string().min(8).max(100),
```
to:
```typescript
  password: z.string().min(10).max(100),
```

- [ ] **Step 3: Add password strength validation to register handler**

After `const body = registerSchema.parse(req.body);` (line 44), add:

```typescript
  const passwordCheck = validatePassword(body.password);
  if (!passwordCheck.valid) {
    throw new AppError(400, passwordCheck.reason!, 'WEAK_PASSWORD');
  }
```

- [ ] **Step 4: Add emailVerified to login/register responses**

In the register response (line 158-167), add `emailVerified: false` to the player object:

```typescript
  res.status(201).json({
    player: {
      id: player.id,
      username: player.username,
      email: player.email,
      role: player.role,
      emailVerified: false,
    },
    accessToken,
    refreshToken,
  });
```

- [ ] **Step 5: Send verification email after registration (fire-and-forget)**

After the `res.status(201).json(...)` call (but before the closing `})`), add:

```typescript
  // Fire-and-forget: don't block registration on email send
  createEmailVerificationToken(player.id)
    .then(({ rawToken }) => sendVerificationEmail(player.email, rawToken, player.username))
    .catch((err) => console.error('Failed to send verification email:', err));
```

- [ ] **Step 6: Add emailVerified to login response**

In the login handler, update the player query (line 174) to include `emailVerified`:

```typescript
  const player = await prisma.player.findUnique({
    where: { email: body.email },
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      passwordHash: true,
      isBot: true,
      emailVerified: true,
    },
  });
```

And in the login response (line 211-220), add `emailVerified`:

```typescript
  res.json({
    player: {
      id: player.id,
      username: player.username,
      email: player.email,
      role: player.role,
      emailVerified: player.emailVerified,
    },
    accessToken,
    refreshToken,
  });
```

- [ ] **Step 7: Update existing register test**

In `auth.test.ts`, update the test body password to meet the new 10-char minimum:

Change line 102 from:
```typescript
        password: 'supersecure',
```
to (already 11 chars, so no change needed — verify it's >= 10 chars).

Also add a mock for `emailVerificationToken` in the `beforeEach`:

```typescript
    mockPrisma.emailVerificationToken = {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({}),
    };
```

Add the email service mock at the top of the test file:

```typescript
vi.mock('../services/emailService', () => ({
  sendVerificationEmail: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../services/authTokenService', () => ({
  createEmailVerificationToken: vi.fn().mockResolvedValue({ rawToken: 'test-token' }),
}));

vi.mock('../utils/passwordValidation', () => ({
  validatePassword: vi.fn().mockReturnValue({ valid: true }),
}));
```

- [ ] **Step 8: Run tests**

```bash
cd apps/api && npx vitest run src/routes/auth.test.ts
```

Expected: All tests PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/routes/auth.ts apps/api/src/routes/auth.test.ts
git commit -m "feat(auth): enforce password strength and send verification email on register"
```

---

## Task 8: Update Login Route (Lockout)

**Files:**
- Modify: `apps/api/src/routes/auth.ts:170-221`

- [ ] **Step 1: Add lockout imports**

At the top of `auth.ts`, add:

```typescript
import { recordFailedLogin, isLockedOut, clearLockout } from '../services/lockoutService';
```

- [ ] **Step 2: Add lockout logic to login handler**

After the player lookup and bot check (after line 184), add the lockout check:

```typescript
  // Check lockout AFTER player lookup — return same 401 to prevent enumeration
  const locked = await isLockedOut(player.id);

  const validPassword = await bcrypt.compare(body.password, player.passwordHash);

  if (!validPassword) {
    // Record failure and return generic error (same whether locked or not)
    await recordFailedLogin(player.id);
    throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
  }

  // Correct password but account is locked — reveal lockout only when password is correct
  if (locked) {
    throw new AppError(423, 'Account temporarily locked, try again later', 'ACCOUNT_LOCKED');
  }

  // Successful login — clear any lockout counter
  await clearLockout(player.id);
```

Remove the old password check block (lines 186-189):
```typescript
  // REMOVE these lines:
  const validPassword = await bcrypt.compare(body.password, player.passwordHash);
  if (!validPassword) {
    throw new AppError(401, 'Invalid credentials', 'INVALID_CREDENTIALS');
  }
```

- [ ] **Step 3: Add lockout tests**

In `auth.test.ts`, add mock for lockout service at the top:

```typescript
vi.mock('../services/lockoutService', () => ({
  recordFailedLogin: vi.fn().mockResolvedValue(undefined),
  isLockedOut: vi.fn().mockResolvedValue(false),
  clearLockout: vi.fn().mockResolvedValue(undefined),
}));
```

Add new test block:

```typescript
describe('POST /login lockout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.refreshToken = {
      create: vi.fn().mockResolvedValue({}),
    };
  });

  it('records failed login on wrong password', async () => {
    const { isLockedOut } = await import('../services/lockoutService');
    const { recordFailedLogin } = await import('../services/lockoutService');
    const bcryptMod = await import('bcrypt');

    (isLockedOut as any).mockResolvedValue(false);
    (bcryptMod.default.compare as any).mockResolvedValue(false);
    mockPrisma.player.findUnique.mockResolvedValue({
      id: 'p1', email: 'a@b.com', passwordHash: 'hash', isBot: false, role: 'player',
    });

    const handler = findHandler('post', '/login');
    const req = { body: { email: 'a@b.com', password: 'wrongpassword' } } as any;
    const res = mockRes();
    const next = vi.fn();

    await handler(req, res, next);

    expect(recordFailedLogin).toHaveBeenCalledWith('p1');
  });

  it('returns 423 when correct password but locked out', async () => {
    const { isLockedOut } = await import('../services/lockoutService');
    const bcryptMod = await import('bcrypt');

    (isLockedOut as any).mockResolvedValue(true);
    (bcryptMod.default.compare as any).mockResolvedValue(true);
    mockPrisma.player.findUnique.mockResolvedValue({
      id: 'p1', email: 'a@b.com', passwordHash: 'hash', isBot: false, role: 'player',
      emailVerified: false,
    });

    const handler = findHandler('post', '/login');
    const req = { body: { email: 'a@b.com', password: 'correctpass' } } as any;
    const res = mockRes();
    const next = vi.fn();

    await handler(req, res, next).catch(() => {});

    // Should throw AppError with 423
    expect(next).toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run tests**

```bash
cd apps/api && npx vitest run src/routes/auth.test.ts
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/auth.ts apps/api/src/routes/auth.test.ts
git commit -m "feat(auth): add Redis-based login lockout to prevent brute force"
```

---

## Task 9: Email Verification Routes

**Files:**
- Modify: `apps/api/src/routes/auth.ts` (add 2 new endpoints)

- [ ] **Step 1: Add Zod schemas**

Add to the schemas section of `auth.ts`:

```typescript
const verifyEmailSchema = z.object({ token: z.string().min(1) });
```

- [ ] **Step 2: Add rate limiter for resend-verification**

```typescript
const resendVerificationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many verification requests, please try again later', code: 'RATE_LIMITED' },
});
```

- [ ] **Step 3: Add POST /verify-email route**

```typescript
import { authenticate } from '../middleware/auth';

const CHAMPION_TRIAL_DAYS = 3;

authRouter.post('/verify-email', asyncHandler(async (req, res) => {
  const { token } = verifyEmailSchema.parse(req.body);

  const tokenRecord = await verifyEmailToken(token);
  if (!tokenRecord) {
    throw new AppError(400, 'Invalid or expired verification token', 'INVALID_TOKEN');
  }

  // Atomic: verify email + grant trial + delete token
  const trialGranted = await prisma.$transaction(async (tx) => {
    const player = await tx.player.findUnique({
      where: { id: tokenRecord.playerId },
      select: { premiumTrialClaimed: true },
    });

    const shouldGrantTrial = player && !player.premiumTrialClaimed;
    const expiresAt = new Date(Date.now() + CHAMPION_TRIAL_DAYS * 24 * 60 * 60 * 1000);

    await tx.player.update({
      where: { id: tokenRecord.playerId },
      data: {
        emailVerified: true,
        ...(shouldGrantTrial ? {
          premiumTrialClaimed: true,
          isPremium: true,
          premiumExpiresAt: expiresAt,
        } : {}),
      },
    });

    await tx.emailVerificationToken.delete({
      where: { id: tokenRecord.id },
    });

    return !!shouldGrantTrial;
  });

  res.json({
    message: trialGranted
      ? 'Email verified! You\'ve been awarded 3 days of Champion.'
      : 'Email verified!',
    championTrialGranted: trialGranted,
  });
}));
```

- [ ] **Step 4: Add POST /resend-verification route**

```typescript
authRouter.post('/resend-verification', authenticate, resendVerificationLimiter, asyncHandler(async (req, res) => {
  const playerId = req.player!.playerId;

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { email: true, username: true, emailVerified: true },
  });

  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  if (player.emailVerified) {
    throw new AppError(400, 'Email is already verified', 'ALREADY_VERIFIED');
  }

  const { rawToken } = await createEmailVerificationToken(playerId);
  await sendVerificationEmail(player.email, rawToken, player.username);

  res.json({ message: 'Verification email sent' });
}));
```

- [ ] **Step 5: Add import for `verifyEmailToken`**

Make sure the import from `authTokenService` includes `verifyEmailToken`:

```typescript
import { createEmailVerificationToken, verifyEmailToken } from '../services/authTokenService';
```

- [ ] **Step 6: Add tests for verification routes**

Add to `auth.test.ts`:

```typescript
describe('POST /verify-email', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.player = {
      ...mockPrisma.player,
      findUnique: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    };
    mockPrisma.emailVerificationToken = {
      delete: vi.fn().mockResolvedValue({}),
    };
  });

  it('returns 400 for invalid token', async () => {
    const { verifyEmailToken } = await import('../services/authTokenService');
    (verifyEmailToken as any).mockResolvedValue(null);

    const handler = findHandler('post', '/verify-email');
    const req = { body: { token: 'bad-token' } } as any;
    const res = mockRes();
    const next = vi.fn();

    await handler(req, res, next);

    // AppError thrown → next called with error
    expect(next).toHaveBeenCalled();
  });
});
```

- [ ] **Step 7: Run tests**

```bash
cd apps/api && npx vitest run src/routes/auth.test.ts
```

Expected: All tests PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/routes/auth.ts apps/api/src/routes/auth.test.ts
git commit -m "feat(auth): add email verification and resend-verification endpoints"
```

---

## Task 10: Password Reset Routes

**Files:**
- Modify: `apps/api/src/routes/auth.ts` (add 2 new endpoints)

- [ ] **Step 1: Add Zod schemas and rate limiter**

```typescript
const forgotPasswordSchema = z.object({ email: z.string().email() });

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(10).max(100),
});

const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many password reset requests, please try again later', code: 'RATE_LIMITED' },
});

// Per-email rate limiting helper (Redis-backed, prevents email bombing)
import { redis } from '../redis';

async function checkEmailRateLimit(email: string): Promise<boolean> {
  const key = `password-reset:email:${email.toLowerCase()}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 3600); // 1 hour TTL
  return count <= 3; // max 3 per hour per email
}
```

- [ ] **Step 2: Add imports**

```typescript
import { createPasswordResetToken, verifyPasswordResetToken } from '../services/authTokenService';
import { sendPasswordResetEmail } from '../services/emailService';
```

- [ ] **Step 3: Add POST /forgot-password route**

```typescript
authRouter.post('/forgot-password', forgotPasswordLimiter, asyncHandler(async (req, res) => {
  const { email } = forgotPasswordSchema.parse(req.body);

  // Always return the same response to prevent enumeration
  const player = await prisma.player.findUnique({
    where: { email },
    select: { id: true, username: true, emailVerified: true },
  });

  if (player?.emailVerified) {
    // Per-email rate limit (3/hour) to prevent email bombing
    const allowed = await checkEmailRateLimit(email);
    if (allowed) {
      const { rawToken } = await createPasswordResetToken(player.id);
      // Fire-and-forget to keep response time constant
      sendPasswordResetEmail(email, rawToken, player.username).catch((err) =>
        console.error('Failed to send password reset email:', err),
      );
    }
  }

  res.json({ message: 'If that email is verified with us, we\'ve sent a reset link.' });
}));
```

- [ ] **Step 4: Add POST /reset-password route**

```typescript
authRouter.post('/reset-password', asyncHandler(async (req, res) => {
  const body = resetPasswordSchema.parse(req.body);

  const passwordCheck = validatePassword(body.password);
  if (!passwordCheck.valid) {
    throw new AppError(400, passwordCheck.reason!, 'WEAK_PASSWORD');
  }

  const tokenRecord = await verifyPasswordResetToken(body.token);
  if (!tokenRecord) {
    throw new AppError(400, 'Invalid or expired reset token', 'INVALID_TOKEN');
  }

  const passwordHash = await bcrypt.hash(body.password, 10);

  // Atomic: update password + mark token used + revoke all sessions
  await prisma.$transaction([
    prisma.player.update({
      where: { id: tokenRecord.playerId },
      data: { passwordHash },
    }),
    prisma.passwordResetToken.update({
      where: { id: tokenRecord.id },
      data: { usedAt: new Date() },
    }),
    prisma.refreshToken.deleteMany({
      where: { playerId: tokenRecord.playerId },
    }),
  ]);

  res.json({ message: 'Password reset successfully. Please log in with your new password.' });
}));
```

- [ ] **Step 5: Add tests**

Add to `auth.test.ts`:

```typescript
describe('POST /forgot-password', () => {
  it('always returns the same response regardless of email existence', async () => {
    mockPrisma.player.findUnique.mockResolvedValue(null);

    const handler = findHandler('post', '/forgot-password');
    const req = { body: { email: 'nonexistent@example.com' } } as any;
    const res = mockRes();
    const next = vi.fn();

    await handler(req, res, next);

    expect(res.json).toHaveBeenCalledWith({
      message: expect.stringContaining('If that email is verified'),
    });
  });
});

describe('POST /reset-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.passwordResetToken = {
      update: vi.fn().mockResolvedValue({}),
    };
    mockPrisma.refreshToken = {
      deleteMany: vi.fn().mockResolvedValue({}),
    };
  });

  it('returns 400 for invalid token', async () => {
    const { verifyPasswordResetToken } = await import('../services/authTokenService');
    (verifyPasswordResetToken as any).mockResolvedValue(null);

    const handler = findHandler('post', '/reset-password');
    const req = { body: { token: 'bad-token', password: 'newpassword123' } } as any;
    const res = mockRes();
    const next = vi.fn();

    await handler(req, res, next);

    expect(next).toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run tests**

```bash
cd apps/api && npx vitest run src/routes/auth.test.ts
```

Expected: All tests PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/routes/auth.ts apps/api/src/routes/auth.test.ts
git commit -m "feat(auth): add forgot-password and reset-password endpoints"
```

---

## Task 11: Change Email & Change Password Routes

**Files:**
- Modify: `apps/api/src/routes/auth.ts` (add 2 new endpoints)

- [ ] **Step 1: Add Zod schemas**

```typescript
const changeEmailSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: z.string().min(10).max(100),
});
```

- [ ] **Step 2: Add POST /change-email route**

```typescript
authRouter.post('/change-email', authenticate, asyncHandler(async (req, res) => {
  const body = changeEmailSchema.parse(req.body);
  const playerId = req.player!.playerId;

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { passwordHash: true, username: true },
  });

  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  const validPassword = await bcrypt.compare(body.password, player.passwordHash);
  if (!validPassword) {
    throw new AppError(401, 'Invalid password', 'INVALID_CREDENTIALS');
  }

  // Check if new email is taken (UX courtesy — DB unique constraint is the real guard)
  const existing = await prisma.player.findUnique({ where: { email: body.email } });
  if (existing) {
    throw new AppError(409, 'Email already in use', 'EMAIL_TAKEN');
  }

  // Update email, reset verification — handle race condition via unique constraint
  try {
    await prisma.$transaction([
      prisma.player.update({
        where: { id: playerId },
        data: { email: body.email, emailVerified: false },
      }),
      prisma.emailVerificationToken.deleteMany({ where: { playerId } }),
    ]);
  } catch (err: any) {
    // Prisma P2002 = unique constraint violation (someone else claimed this email between check and update)
    if (err?.code === 'P2002') {
      throw new AppError(409, 'Email already in use', 'EMAIL_TAKEN');
    }
    throw err;
  }

  // Send verification email to new address
  createEmailVerificationToken(playerId)
    .then(({ rawToken }) => sendVerificationEmail(body.email, rawToken, player.username))
    .catch((err) => console.error('Failed to send verification email:', err));

  res.json({ message: 'Email updated. Check your inbox to verify your new address.' });
}));
```

- [ ] **Step 3: Add POST /change-password route**

```typescript
authRouter.post('/change-password', authenticate, asyncHandler(async (req, res) => {
  const body = changePasswordSchema.parse(req.body);
  const playerId = req.player!.playerId;

  const passwordCheck = validatePassword(body.newPassword);
  if (!passwordCheck.valid) {
    throw new AppError(400, passwordCheck.reason!, 'WEAK_PASSWORD');
  }

  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { passwordHash: true },
  });

  if (!player) {
    throw new AppError(404, 'Player not found', 'NOT_FOUND');
  }

  const validPassword = await bcrypt.compare(body.currentPassword, player.passwordHash);
  if (!validPassword) {
    throw new AppError(401, 'Current password is incorrect', 'INVALID_CREDENTIALS');
  }

  const newPasswordHash = await bcrypt.hash(body.newPassword, 10);

  // Update password and revoke all other sessions
  await prisma.player.update({
    where: { id: playerId },
    data: { passwordHash: newPasswordHash },
  });

  // Revoke all sessions. The spec suggests keeping the current session, but
  // the refresh token isn't available in this request context (it's in localStorage,
  // not sent with authenticated API calls). Deleting all is the safe default —
  // user re-logs in with their new password.
  await prisma.refreshToken.deleteMany({
    where: { playerId },
  });

  res.json({ message: 'Password updated. Please log in again.' });
}));
```

- [ ] **Step 4: Add tests**

Add to `auth.test.ts`:

```typescript
describe('POST /change-password', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.refreshToken = { deleteMany: vi.fn().mockResolvedValue({}) };
  });

  it('rejects incorrect current password', async () => {
    const bcryptMod = await import('bcrypt');
    (bcryptMod.default.compare as any).mockResolvedValue(false);
    mockPrisma.player.findUnique.mockResolvedValue({ passwordHash: 'hash' });

    const handler = findHandler('post', '/change-password');
    const req = {
      body: { currentPassword: 'wrong', newPassword: 'newpassword123' },
      player: { playerId: 'p1' },
    } as any;
    const res = mockRes();
    const next = vi.fn();

    await handler(req, res, next);
    expect(next).toHaveBeenCalled(); // AppError thrown
  });
});
```

- [ ] **Step 5: Run tests**

```bash
cd apps/api && npx vitest run src/routes/auth.test.ts
```

Expected: All tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/auth.ts apps/api/src/routes/auth.test.ts
git commit -m "feat(auth): add change-email and change-password endpoints"
```

---

## Task 12: Token Cleanup Job

**Files:**
- Modify: `apps/api/src/index.ts:165-188`

- [ ] **Step 1: Create cleanup function in authTokenService**

Add to `apps/api/src/services/authTokenService.ts`:

```typescript
/** Delete expired tokens from both token tables. Called periodically. */
export async function cleanupExpiredTokens(): Promise<void> {
  const now = new Date();
  await Promise.all([
    prisma.emailVerificationToken.deleteMany({ where: { expiresAt: { lt: now } } }),
    prisma.passwordResetToken.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: now } },
          { usedAt: { not: null } },
        ],
      },
    }),
  ]);
}
```

- [ ] **Step 2: Wire cleanup into server startup**

In `apps/api/src/index.ts`, add import:

```typescript
import { cleanupExpiredTokens } from './services/authTokenService';
```

Add after the leaderboard refresh interval (after line 187):

```typescript
  // Auth token cleanup (every 6 hours)
  setInterval(() => {
    cleanupExpiredTokens().catch((err) => {
      console.error('Auth token cleanup error:', err);
    });
  }, 6 * 60 * 60 * 1000);
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/services/authTokenService.ts apps/api/src/index.ts
git commit -m "feat(auth): add scheduled cleanup for expired auth tokens"
```

---

## Task 13: Frontend API Functions & Add emailVerified to Player Endpoint

**Files:**
- Modify: `apps/web/src/lib/api/auth.ts`
- Modify: `apps/web/src/lib/api/index.ts`
- Modify: `apps/web/src/hooks/useAuth.ts`

- [ ] **Step 1: Add new API functions to auth.ts**

Add to `apps/web/src/lib/api/auth.ts`:

```typescript
export async function verifyEmail(token: string) {
  return fetchApi<{ message: string; championTrialGranted: boolean }>('/api/v1/auth/verify-email', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export async function resendVerification() {
  return fetchApi<{ message: string }>('/api/v1/auth/resend-verification', {
    method: 'POST',
  });
}

export async function forgotPassword(email: string) {
  return fetchApi<{ message: string }>('/api/v1/auth/forgot-password', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, password: string) {
  return fetchApi<{ message: string }>('/api/v1/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify({ token, password }),
  });
}

export async function changeEmail(email: string, password: string) {
  return fetchApi<{ message: string }>('/api/v1/auth/change-email', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function changePassword(currentPassword: string, newPassword: string) {
  return fetchApi<{ message: string }>('/api/v1/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}
```

- [ ] **Step 2: Update auth.ts register/login return types**

Update the `register` and `login` function return types to include `emailVerified`:

```typescript
player: { id: string; username: string; email: string; role: string; emailVerified: boolean };
```

- [ ] **Step 3: Export new functions from index.ts**

Update line 4 of `apps/web/src/lib/api/index.ts`:

```typescript
export { register, login, refreshToken, verifyEmail, resendVerification, forgotPassword, resetPassword, changeEmail, changePassword } from './auth';
```

- [ ] **Step 4: Update Player interface in useAuth.ts**

In `apps/web/src/hooks/useAuth.ts`, update the `Player` interface:

```typescript
interface Player {
  id: string;
  username: string;
  email: string;
  role: string;
  emailVerified: boolean;
}
```

- [ ] **Step 5: Add emailVerified to GET /player endpoint**

In `apps/api/src/routes/player.ts`, find the `GET /` handler's `select` object (around line 31-42) and add `emailVerified: true` alongside the other selected fields:

```typescript
    select: {
      id: true,
      username: true,
      email: true,
      role: true,
      emailVerified: true,  // ← ADD THIS
      createdAt: true,
      // ... rest stays the same
```

Also add `isPremium: true` and `premiumExpiresAt: true` so the frontend can display Champion status.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/api/auth.ts apps/web/src/lib/api/index.ts apps/web/src/hooks/useAuth.ts apps/api/src/routes/player.ts
git commit -m "feat(web): add frontend API functions for auth hardening, expose emailVerified in player endpoint"
```

---

## Task 14: Password Strength Indicator Component

**Files:**
- Create: `apps/web/src/components/PasswordStrengthIndicator.tsx`

- [ ] **Step 1: Create the component**

```typescript
'use client';

// Mirrors the server-side blocklist check — only includes passwords >= 10 chars
// that would pass the length check but should still be rejected.
const COMMON_LONG_PASSWORDS = new Set([
  'password123', 'password1234', 'qwerty12345', '1234567890', 'letmein1234',
  'iloveyou123', 'trustno1234', 'welcome1234', 'monkey12345', 'dragon12345',
  // A small client-side subset for instant feedback. Full check happens server-side.
]);

interface Props {
  password: string;
}

export function PasswordStrengthIndicator({ password }: Props) {
  if (password.length === 0) return null;

  let message: string;
  let color: string;

  if (password.length < 10) {
    message = `Too short (${password.length}/10)`;
    color = 'var(--rpg-red)';
  } else if (COMMON_LONG_PASSWORDS.has(password.toLowerCase())) {
    message = 'Too common — try something more creative';
    color = 'var(--rpg-red)';
  } else {
    message = 'Looks good';
    color = 'var(--rpg-green-light)';
  }

  return (
    <p className="text-xs mt-1" style={{ color }}>
      {message}
    </p>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/PasswordStrengthIndicator.tsx
git commit -m "feat(web): add password strength indicator component"
```

---

## Task 15: Update Register & Login Pages

**Files:**
- Modify: `apps/web/src/app/register/page.tsx`
- Modify: `apps/web/src/app/login/page.tsx`

- [ ] **Step 1: Update register page**

In `apps/web/src/app/register/page.tsx`:

1. Import the indicator:
```typescript
import { PasswordStrengthIndicator } from '@/components/PasswordStrengthIndicator';
```

2. Add state for showing post-registration message:
```typescript
const [registered, setRegistered] = useState(false);
```

3. Change `minLength={8}` to `minLength={10}` on the password input.

4. Add the indicator after the password input:
```typescript
<PasswordStrengthIndicator password={password} />
```

5. After successful registration (where `setTokens` is called), set `setRegistered(true)` and show a note before navigating:
```typescript
if (data) {
  setTokens(data.accessToken, data.refreshToken, data.player);
  // Brief note — user will see it before redirect
  setRegistered(true);
  router.push('/game');
}
```

6. Add a note below the form (before the "Already have an account?" link):
```typescript
{registered && (
  <p className="text-sm text-[var(--rpg-gold)] text-center mt-4">
    Check your email to verify and claim 3 days of Champion!
  </p>
)}
```

- [ ] **Step 2: Update login page**

In `apps/web/src/app/login/page.tsx`, add a "Forgot password?" link below the password field, before the error display:

```typescript
<div className="flex justify-end">
  <a href="/forgot-password" className="text-xs text-[var(--rpg-blue-light)] hover:underline">
    Forgot password?
  </a>
</div>
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app/register/page.tsx apps/web/src/app/login/page.tsx
git commit -m "feat(web): add password strength to register, forgot-password link to login"
```

---

## Task 16: Verify Email Page

**Files:**
- Create: `apps/web/src/app/verify-email/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { verifyEmail, resendVerification } from '@/lib/api';
import { PixelButton } from '@/components/PixelButton';

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const [championGranted, setChampionGranted] = useState(false);
  const [resending, setResending] = useState(false);

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setMessage('No verification token provided.');
      return;
    }

    verifyEmail(token).then(({ data, error }) => {
      if (error) {
        setStatus('error');
        setMessage(error.message);
      } else if (data) {
        setStatus('success');
        setMessage(data.message);
        setChampionGranted(data.championTrialGranted);
      }
    });
  }, [token]);

  const handleResend = async () => {
    setResending(true);
    const { error } = await resendVerification();
    if (error) {
      setMessage(error.message);
    } else {
      setMessage('New verification email sent! Check your inbox.');
    }
    setResending(false);
  };

  return (
    <main className="relative min-h-screen flex items-center justify-center p-4">
      <Image src="/assets/zones/zone_forest_edge.webp" alt="Forest Edge" fill className="object-cover" priority />
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-[var(--rpg-background)]" />

      <div className="relative z-10 w-full max-w-sm bg-[var(--rpg-surface)]/90 border border-[var(--rpg-border)] rounded-xl p-6 md:p-8 backdrop-blur-sm rpg-card-texture text-center">
        {status === 'loading' && (
          <p className="text-[var(--rpg-text-secondary)]">Verifying your email...</p>
        )}

        {status === 'success' && (
          <>
            <h1 className="text-2xl font-bold font-almendra text-[var(--rpg-gold)] mb-4 rpg-gold-text-glow">
              {championGranted ? 'Champion Activated!' : 'Email Verified!'}
            </h1>
            <p className="text-[var(--rpg-text-secondary)] mb-6">{message}</p>
            <PixelButton variant="primary" onClick={() => window.location.href = '/game'}>
              Continue to Game
            </PixelButton>
          </>
        )}

        {status === 'error' && (
          <>
            <h1 className="text-2xl font-bold font-almendra text-[var(--rpg-red)] mb-4">
              Verification Failed
            </h1>
            <p className="text-[var(--rpg-text-secondary)] mb-6">{message}</p>
            <PixelButton variant="secondary" onClick={handleResend} disabled={resending}>
              {resending ? 'Sending...' : 'Resend Verification Email'}
            </PixelButton>
          </>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/verify-email/page.tsx
git commit -m "feat(web): add email verification landing page"
```

---

## Task 17: Forgot Password Page

**Files:**
- Create: `apps/web/src/app/forgot-password/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
'use client';

import { useState } from 'react';
import Image from 'next/image';
import { forgotPassword } from '@/lib/api';
import { PixelButton } from '@/components/PixelButton';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const { error: apiError } = await forgotPassword(email);

    if (apiError) {
      setError(apiError.message);
      setLoading(false);
      return;
    }

    setSubmitted(true);
    setLoading(false);
  };

  return (
    <main className="relative min-h-screen flex items-center justify-center p-4">
      <Image src="/assets/zones/zone_forest_edge.webp" alt="Forest Edge" fill className="object-cover" priority />
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-[var(--rpg-background)]" />

      <div className="relative z-10 w-full max-w-sm bg-[var(--rpg-surface)]/90 border border-[var(--rpg-border)] rounded-xl p-6 md:p-8 backdrop-blur-sm rpg-card-texture">
        <h1 className="text-2xl font-bold font-almendra text-[var(--rpg-gold)] text-center mb-6 rpg-gold-text-glow">
          Reset Password
        </h1>

        {submitted ? (
          <div className="text-center">
            <p className="text-[var(--rpg-text-secondary)] mb-4">
              If that email is verified with us, we've sent a reset link. Check your inbox.
            </p>
            <a href="/login" className="text-[var(--rpg-blue-light)] hover:underline text-sm">
              Back to login
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="email" className="text-sm font-crimson text-[var(--rpg-text-secondary)]">Email</label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="px-3 py-2.5 bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded-lg text-[var(--rpg-text-primary)] focus:outline-none focus:border-[var(--rpg-blue-light)] transition-colors"
              />
            </div>

            {error && <p className="text-sm text-[var(--rpg-red)] text-center">{error}</p>}

            <PixelButton type="submit" variant="primary" disabled={loading}>
              {loading ? 'Sending...' : 'Send Reset Link'}
            </PixelButton>

            <p className="text-center text-sm text-[var(--rpg-text-secondary)]">
              <a href="/login" className="text-[var(--rpg-blue-light)] hover:underline">Back to login</a>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/forgot-password/page.tsx
git commit -m "feat(web): add forgot password page"
```

---

## Task 18: Reset Password Page

**Files:**
- Create: `apps/web/src/app/reset-password/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
'use client';

import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import { resetPassword } from '@/lib/api';
import { PixelButton } from '@/components/PixelButton';
import { PasswordStrengthIndicator } from '@/components/PasswordStrengthIndicator';

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (!token) {
    return (
      <main className="relative min-h-screen flex items-center justify-center p-4">
        <div className="text-[var(--rpg-red)]">Invalid reset link — no token provided.</div>
      </main>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);
    const { error: apiError } = await resetPassword(token, password);

    if (apiError) {
      setError(apiError.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
    setTimeout(() => router.push('/login'), 2000);
  };

  return (
    <main className="relative min-h-screen flex items-center justify-center p-4">
      <Image src="/assets/zones/zone_forest_edge.webp" alt="Forest Edge" fill className="object-cover" priority />
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-[var(--rpg-background)]" />

      <div className="relative z-10 w-full max-w-sm bg-[var(--rpg-surface)]/90 border border-[var(--rpg-border)] rounded-xl p-6 md:p-8 backdrop-blur-sm rpg-card-texture">
        <h1 className="text-2xl font-bold font-almendra text-[var(--rpg-gold)] text-center mb-6 rpg-gold-text-glow">
          New Password
        </h1>

        {success ? (
          <div className="text-center">
            <p className="text-[var(--rpg-green-light)] mb-4">Password reset! Redirecting to login...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label htmlFor="password" className="text-sm font-crimson text-[var(--rpg-text-secondary)]">New Password</label>
              <input
                type="password"
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={10}
                className="px-3 py-2.5 bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded-lg text-[var(--rpg-text-primary)] focus:outline-none focus:border-[var(--rpg-blue-light)] transition-colors"
              />
              <PasswordStrengthIndicator password={password} />
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="confirmPassword" className="text-sm font-crimson text-[var(--rpg-text-secondary)]">Confirm Password</label>
              <input
                type="password"
                id="confirmPassword"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={10}
                className="px-3 py-2.5 bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded-lg text-[var(--rpg-text-primary)] focus:outline-none focus:border-[var(--rpg-blue-light)] transition-colors"
              />
            </div>

            {error && <p className="text-sm text-[var(--rpg-red)] text-center">{error}</p>}

            <PixelButton type="submit" variant="primary" disabled={loading}>
              {loading ? 'Resetting...' : 'Reset Password'}
            </PixelButton>
          </form>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/reset-password/page.tsx
git commit -m "feat(web): add reset password page with strength indicator"
```

---

## Task 19: Verification Banner

**Files:**
- Create: `apps/web/src/components/VerificationBanner.tsx`

This task covers the in-game verification banner. The full account settings page (email change, password change UI) is a larger UI task that depends on how the existing game UI is structured. The banner is the minimal viable piece.

- [ ] **Step 1: Create VerificationBanner component**

```typescript
'use client';

import { useState } from 'react';
import { resendVerification } from '@/lib/api';

interface Props {
  emailVerified: boolean;
}

export function VerificationBanner({ emailVerified }: Props) {
  const [dismissed, setDismissed] = useState(false);
  const [resending, setResending] = useState(false);
  const [message, setMessage] = useState('');

  if (emailVerified || dismissed) return null;

  const handleResend = async () => {
    setResending(true);
    const { error } = await resendVerification();
    setMessage(error ? error.message : 'Verification email sent!');
    setResending(false);
  };

  return (
    <div className="bg-[var(--rpg-surface)] border border-[var(--rpg-gold)]/30 rounded-lg p-3 mb-3 flex items-center justify-between gap-2 text-sm">
      <div className="flex-1">
        <span className="text-[var(--rpg-text-secondary)]">
          Verify your email to unlock account recovery and get{' '}
          <span className="text-[var(--rpg-gold)] font-semibold">3 days of Champion</span>.
        </span>
        {message && <span className="text-xs text-[var(--rpg-blue-light)] ml-2">{message}</span>}
      </div>
      <div className="flex gap-2 shrink-0">
        <button
          onClick={handleResend}
          disabled={resending}
          className="text-xs text-[var(--rpg-blue-light)] hover:underline disabled:opacity-50"
        >
          {resending ? 'Sending...' : 'Resend'}
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="text-xs text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Integrate banner into game page**

The game page (`apps/web/src/app/game/page.tsx`) uses `useGameController()` which returns a `player` object. The banner should go at the top of the main game content area.

In `apps/web/src/app/game/page.tsx`:

1. Import the component:
```typescript
import { VerificationBanner } from '@/components/VerificationBanner';
```

2. Find where the main game content renders (look for the first `<div>` or layout wrapper after the loading/auth checks). Add the banner just inside it:
```typescript
{player && <VerificationBanner emailVerified={player.emailVerified} />}
```

3. The `player` object needs `emailVerified` — this was added to the `GET /player` endpoint in Task 13, Step 5. Verify that `useGameController`'s player type includes `emailVerified`. If the type is inferred from the API response, it should pick it up automatically. If there's a manual type definition, add `emailVerified: boolean` to it.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/VerificationBanner.tsx
git commit -m "feat(web): add in-game email verification banner"
```

---

## Task 20: Build Verification & Final Testing

- [ ] **Step 1: Build shared packages**

```bash
npm run build
```

Expected: Build succeeds with no new errors.

- [ ] **Step 2: Run typecheck**

```bash
npm run typecheck
```

Expected: No new type errors (pre-existing `page.tsx:333` error may persist).

- [ ] **Step 3: Run all API tests**

```bash
npm run test:api
```

Expected: All tests pass.

- [ ] **Step 4: Run game engine tests**

```bash
npm run test:engine
```

Expected: All tests pass (no changes to game engine).

- [ ] **Step 5: Manual smoke test checklist**

Start the dev server (`npm run dev`) and verify:

1. Register with a password < 10 chars → rejected
2. Register with `password123` → rejected as common
3. Register with a valid password → succeeds, verification email sent (check Resend dashboard)
4. Login → response includes `emailVerified: false`
5. Click verification link → email verified, Champion trial granted
6. Login after verification → `emailVerified: true`
7. Forgot password with unverified email → generic success message, no email sent
8. Forgot password with verified email → reset email sent
9. Reset password with valid token → password updated, all sessions revoked
10. 5 failed logins → correct password returns 423 (locked)
11. Wait 15 min (or flush Redis) → login works again

- [ ] **Step 6: Final commit (if any fixups needed)**

```bash
git add -A && git commit -m "fix: address issues from auth hardening smoke test"
```
