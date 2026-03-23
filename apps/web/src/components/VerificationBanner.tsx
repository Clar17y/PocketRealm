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
