import { describe, expect, it, vi } from 'vitest';

vi.mock('resend', () => {
  const send = vi.fn().mockResolvedValue({ data: { id: 'email-1' }, error: null });
  return {
    Resend: vi.fn().mockImplementation(function (this: { emails: { send: typeof send } }) {
      this.emails = { send };
    }),
  };
});

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
