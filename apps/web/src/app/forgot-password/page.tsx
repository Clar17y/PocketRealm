'use client';

import { useState } from 'react';
import Image from 'next/image';
import { forgotPassword } from '@/lib/api';
import { PixelButton } from '@/components/PixelButton';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
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

    setSuccess(true);
    setLoading(false);
  };

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

      <div className="relative z-10 w-full max-w-sm bg-[var(--rpg-surface)]/90 border border-[var(--rpg-border)] rounded-xl p-6 md:p-8 backdrop-blur-sm rpg-card-texture">
        <h1 className="text-2xl font-bold font-almendra text-[var(--rpg-gold)] text-center mb-6 rpg-gold-text-glow">
          Forgot Password
        </h1>

        {success ? (
          <div className="text-center">
            <p className="text-[var(--rpg-text-secondary)] mb-6">
              If that email is registered, you&apos;ll receive a password reset link shortly. Check your inbox.
            </p>
            <a href="/login" className="text-sm text-[var(--rpg-blue-light)] hover:underline">
              Back to login
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <p className="text-sm font-crimson text-[var(--rpg-text-secondary)]">
              Enter your email address and we&apos;ll send you a link to reset your password.
            </p>

            <div className="flex flex-col gap-1">
              <label htmlFor="email" className="text-sm font-crimson text-[var(--rpg-text-secondary)]">
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="px-3 py-2.5 bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded-lg text-[var(--rpg-text-primary)] focus:outline-none focus:border-[var(--rpg-blue-light)] transition-colors"
              />
            </div>

            {error && (
              <p className="text-sm text-[var(--rpg-red)] text-center">{error}</p>
            )}

            <PixelButton type="submit" variant="primary" disabled={loading} className="mt-2">
              {loading ? 'Sending...' : 'Send Reset Link'}
            </PixelButton>

            <p className="text-center text-sm text-[var(--rpg-text-secondary)]">
              <a href="/login" className="text-[var(--rpg-blue-light)] hover:underline">
                Back to login
              </a>
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
