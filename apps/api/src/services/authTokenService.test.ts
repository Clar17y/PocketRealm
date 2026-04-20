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

  it('deletes existing tokens for the account before creating a new one', async () => {
    const { rawToken } = await createEmailVerificationToken('account-1');

    expect(mockPrisma.emailVerificationToken.deleteMany).toHaveBeenNthCalledWith(1, {
      where: { accountId: 'account-1' },
    });
    expect(mockPrisma.emailVerificationToken.deleteMany).toHaveBeenNthCalledWith(2, {
      where: { expiresAt: { lt: expect.any(Date) } },
    });
    expect(mockPrisma.emailVerificationToken.create).toHaveBeenCalled();
    expect(rawToken).toHaveLength(64);
  });
});

describe('createPasswordResetToken', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.passwordResetToken = {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create: vi.fn().mockResolvedValue({ id: 'reset-1' }),
      findUnique: vi.fn(),
    };
  });

  it('deletes existing, expired, and used reset tokens before creating a new one', async () => {
    const { rawToken } = await createPasswordResetToken('account-1');

    expect(mockPrisma.passwordResetToken.deleteMany).toHaveBeenNthCalledWith(1, {
      where: { accountId: 'account-1' },
    });
    expect(mockPrisma.passwordResetToken.deleteMany).toHaveBeenNthCalledWith(2, {
      where: {
        OR: [
          { expiresAt: { lt: expect.any(Date) } },
          { usedAt: { not: null } },
        ],
      },
    });
    expect(mockPrisma.passwordResetToken.create).toHaveBeenCalled();
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
      accountId: 'account-1',
      expiresAt: future,
    });

    const result = await verifyEmailToken('some-raw-token');
    expect(result).toEqual({ id: 'tok-1', accountId: 'account-1', expiresAt: future });
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
      accountId: 'account-1',
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
      accountId: 'account-1',
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: new Date(),
    });

    const result = await verifyPasswordResetToken('used-token');
    expect(result).toBeNull();
  });
});
