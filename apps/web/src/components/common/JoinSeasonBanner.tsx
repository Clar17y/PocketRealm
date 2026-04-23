'use client';

import { useEffect, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { formatTimeRemaining } from '@/lib/format';

interface JoinSeasonBannerProps {
  seasonName: string;
  seasonEndsAt: string;
  suggestedUsername: string;
  isJoining: boolean;
  error: string | null;
  onJoin: (username: string) => Promise<void>;
}

export function JoinSeasonBanner({
  seasonName,
  seasonEndsAt,
  suggestedUsername,
  isJoining,
  error,
  onJoin,
}: JoinSeasonBannerProps) {
  const [username, setUsername] = useState(suggestedUsername);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    setUsername(suggestedUsername);
  }, [suggestedUsername]);

  const handleJoin = async () => {
    const trimmed = username.trim();
    if (trimmed.length < 3) {
      setValidationError('Seasonal name must be at least 3 characters.');
      return;
    }

    setValidationError(null);
    await onJoin(trimmed);
  };

  return (
    <PixelCard className="mb-3 border-[var(--rpg-gold)]/60 bg-[var(--rpg-gold)]/10">
      <div className="flex flex-col gap-3">
        <div>
          <p className="text-[10px] font-pixel uppercase tracking-wide text-[var(--rpg-gold)]">
            Seasonal Realm
          </p>
          <h2 className="mt-1 text-lg font-bold font-almendra text-[var(--rpg-text-primary)]">
            {seasonName} is live
          </h2>
          <p className="mt-1 text-sm text-[var(--rpg-text-secondary)]">
            Create a fresh character to compete. Your permanent realm progress stays untouched.
          </p>
          <p className="mt-1 text-xs text-[var(--rpg-text-secondary)]">
            Ends in {formatTimeRemaining(seasonEndsAt)}.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={username}
            maxLength={32}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Choose a seasonal name"
            className="flex-1 rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] px-3 py-2 text-sm text-[var(--rpg-text-primary)] outline-none focus:border-[var(--rpg-gold)]"
            aria-label="Seasonal username"
          />
          <button
            type="button"
            onClick={() => void handleJoin()}
            disabled={isJoining}
            className="rounded bg-[var(--rpg-gold)] px-4 py-2 text-sm font-bold text-black transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isJoining ? 'Creating...' : 'Join season'}
          </button>
        </div>

        {(validationError || error) && (
          <p className="text-xs font-bold text-[var(--rpg-red)]">
            {validationError ?? error}
          </p>
        )}
      </div>
    </PixelCard>
  );
}
