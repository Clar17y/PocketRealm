'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { resetPassword } from '@/lib/api';
import { PixelButton } from '@/components/PixelButton';
import { PasswordStrengthIndicator } from '@/components/PasswordStrengthIndicator';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  if (!token) {
    return (
      <div className="relative z-10 w-full max-w-sm bg-[var(--rpg-surface)]/90 border border-[var(--rpg-border)] rounded-xl p-6 md:p-8 backdrop-blur-sm rpg-card-texture text-center">
        <h1 className="text-2xl font-bold font-almendra text-[var(--rpg-red)] mb-4">
          Invalid Link
        </h1>
        <p className="text-[var(--rpg-text-secondary)] mb-6">
          This password reset link is invalid or missing. Please request a new one.
        </p>
        <a href="/forgot-password" className="text-sm text-[var(--rpg-blue-light)] hover:underline">
          Request new reset link
        </a>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
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
    setLoading(false);
    setTimeout(() => {
      window.location.href = '/login';
    }, 2000);
  };

  return (
    <div className="relative z-10 w-full max-w-sm bg-[var(--rpg-surface)]/90 border border-[var(--rpg-border)] rounded-xl p-6 md:p-8 backdrop-blur-sm rpg-card-texture">
      <h1 className="text-2xl font-bold font-almendra text-[var(--rpg-gold)] text-center mb-6 rpg-gold-text-glow">
        Reset Password
      </h1>

      {success ? (
        <div className="text-center">
          <p className="text-[var(--rpg-text-secondary)] mb-2">
            Password reset successfully!
          </p>
          <p className="text-sm text-[var(--rpg-text-secondary)]">
            Redirecting to login...
          </p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-crimson text-[var(--rpg-text-secondary)]">
              New Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="px-3 py-2.5 bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded-lg text-[var(--rpg-text-primary)] focus:outline-none focus:border-[var(--rpg-blue-light)] transition-colors"
            />
            <PasswordStrengthIndicator password={password} />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="confirmPassword" className="text-sm font-crimson text-[var(--rpg-text-secondary)]">
              Confirm Password
            </label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="px-3 py-2.5 bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded-lg text-[var(--rpg-text-primary)] focus:outline-none focus:border-[var(--rpg-blue-light)] transition-colors"
            />
          </div>

          {error && (
            <p className="text-sm text-[var(--rpg-red)] text-center">{error}</p>
          )}

          <PixelButton type="submit" variant="primary" disabled={loading} className="mt-2">
            {loading ? 'Resetting...' : 'Reset Password'}
          </PixelButton>

          <p className="text-center text-sm text-[var(--rpg-text-secondary)]">
            <a href="/login" className="text-[var(--rpg-blue-light)] hover:underline">
              Back to login
            </a>
          </p>
        </form>
      )}
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="relative min-h-screen flex items-center justify-center p-4">
      <Image
        src="/assets/zones/zone_forest_edge.webp"
        alt="Forest Edge"
        fill
        sizes="100vw"
        className="object-cover"
        priority
      />
      <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/40 to-[var(--rpg-background)]" />
      <Suspense fallback={<div className="relative z-10 text-[var(--rpg-text-secondary)]">Loading...</div>}>
        <ResetPasswordContent />
      </Suspense>
    </main>
  );
}
