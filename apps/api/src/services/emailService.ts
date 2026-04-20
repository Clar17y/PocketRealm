import { Resend } from 'resend';
import { escapeHtml } from '../utils/sanitize';

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
        <p style="line-height: 1.6;">Verify your email to unlock <strong>account recovery</strong> and claim <strong style="color: #d4a947;">3 days of Champion</strong>.</p>
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
