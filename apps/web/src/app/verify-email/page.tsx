'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Image from 'next/image';
import { verifyEmail, resendVerification } from '@/lib/api';
import { PixelButton } from '@/components/PixelButton';

function VerifyEmailContent() {
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
  );
}

export default function VerifyEmailPage() {
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
        <VerifyEmailContent />
      </Suspense>
    </main>
  );
}
