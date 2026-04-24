'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { login } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useIsHydrated } from '@/hooks/useIsHydrated';
import { PixelButton } from '@/components/PixelButton';
import { RELOGIN_MESSAGE_KEY } from './reloginMessage';

export default function LoginPage() {
  const router = useRouter();
  const { setTokens, isLoading, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const isHydrated = useIsHydrated();

  useEffect(() => {
    const loginMessage = sessionStorage.getItem(RELOGIN_MESSAGE_KEY);
    if (!loginMessage) return;

    setMessage(loginMessage);
    sessionStorage.removeItem(RELOGIN_MESSAGE_KEY);
  }, []);

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.push('/game');
    }
  }, [isLoading, isAuthenticated, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    const { data, error: apiError } = await login(email, password);

    if (apiError) {
      setError(apiError.message);
      setLoading(false);
      return;
    }

    if (data) {
      setTokens(data.accessToken, data.refreshToken, data.player);
      router.push('/game');
    }

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
          Welcome Back
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
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

          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm font-crimson text-[var(--rpg-text-secondary)]">
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="px-3 py-2.5 bg-[var(--rpg-background)] border border-[var(--rpg-border)] rounded-lg text-[var(--rpg-text-primary)] focus:outline-none focus:border-[var(--rpg-blue-light)] transition-colors"
            />
          </div>

          <div className="flex justify-end">
            <a href="/forgot-password" className="text-xs text-[var(--rpg-blue-light)] hover:underline">
              Forgot password?
            </a>
          </div>

          {message && (
            <p className="text-sm text-[var(--rpg-blue-light)] text-center">{message}</p>
          )}

          {error && (
            <p className="text-sm text-[var(--rpg-red)] text-center">{error}</p>
          )}

          <PixelButton type={isHydrated ? 'submit' : 'button'} variant="primary" disabled={loading} className="mt-2">
            {loading ? 'Logging in...' : 'Enter World'}
          </PixelButton>
        </form>

        <p className="mt-6 text-center text-sm text-[var(--rpg-text-secondary)]">
          New here?{' '}
          <a href="/register" className="text-[var(--rpg-blue-light)] hover:underline">
            Create an account
          </a>
        </p>
      </div>
    </main>
  );
}
