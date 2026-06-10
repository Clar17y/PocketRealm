'use client';

import { useEffect, useRef, useState } from 'react';
import { Link2 } from 'lucide-react';
import { PixelCard } from '@/components/PixelCard';
import {
  claimDiscordLinkCode,
  getDiscordLinkStatus,
  normalizeDiscordLinkStatus,
  type ApiResponse,
  type DiscordLinkApiResponse,
  type DiscordLinkStatusResponse,
} from '@/lib/api';

type DiscordLinkApi = Promise<ApiResponse<DiscordLinkApiResponse>>;

interface DiscordLinkCardProps {
  loadStatus?: () => DiscordLinkApi;
  claimCode?: (code: string) => DiscordLinkApi;
}

const inputClassName =
  'mt-1 w-full rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] px-3 py-2 text-sm font-bold uppercase tracking-wide text-[var(--rpg-text-primary)] outline-none focus:border-[var(--rpg-gold)] disabled:cursor-not-allowed disabled:opacity-60';

const primaryButtonClassName =
  'inline-flex items-center gap-2 rounded bg-[var(--rpg-gold)] px-4 py-2 text-xs font-bold text-black transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60';

function normalizeCode(value: string) {
  return value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 8);
}

export function DiscordLinkCard({
  loadStatus = getDiscordLinkStatus,
  claimCode = claimDiscordLinkCode,
}: DiscordLinkCardProps) {
  const [status, setStatus] = useState<DiscordLinkStatusResponse | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isClaiming, setIsClaiming] = useState(false);
  const statusRequestVersion = useRef(0);

  useEffect(() => {
    let active = true;
    const requestVersion = statusRequestVersion.current + 1;
    statusRequestVersion.current = requestVersion;
    setIsLoading(true);

    void (async () => {
      const response = await loadStatus();

      if (!active || requestVersion !== statusRequestVersion.current) {
        return;
      }

      setIsLoading(false);
      if (response.data) {
        setStatus(normalizeDiscordLinkStatus(response.data));
        setError(null);
        return;
      }

      setError(response.error?.message ?? 'Failed to load Discord link status.');
    })();

    return () => {
      active = false;
    };
  }, [loadStatus]);

  const handleClaim = async () => {
    const linkCode = normalizeCode(code);
    if (linkCode.length !== 8) {
      setError('Enter the 8-character Discord link code.');
      return;
    }

    setIsClaiming(true);
    setError(null);

    const response = await claimCode(linkCode);

    setIsClaiming(false);
    if (response.data) {
      statusRequestVersion.current += 1;
      setIsLoading(false);
      setStatus(normalizeDiscordLinkStatus(response.data));
      setCode('');
      return;
    }

    setError(response.error?.message ?? 'Failed to link Discord account.');
  };

  const isLinked = Boolean(status?.linked);
  const discordUserId = status?.discordUserId;
  const titleReward = status?.titleReward ?? (isLinked ? 'Linked Adventurer' : null);
  const areClaimControlsDisabled = isLoading || isClaiming || isLinked;

  return (
    <PixelCard>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-[var(--rpg-text-primary)]">Discord Account</h3>
          <p className="mt-1 text-xs text-[var(--rpg-text-secondary)]">
            {isLoading
              ? 'Checking Discord link status...'
              : isLinked
                ? 'Discord account linked.'
                : 'Link your Discord account with an in-game reward code.'}
          </p>
        </div>
        <span
          className={`shrink-0 rounded border px-2 py-1 text-[10px] font-pixel uppercase tracking-wide ${
            isLinked
              ? 'border-[var(--rpg-green-light)] text-[var(--rpg-green-light)]'
              : 'border-[var(--rpg-border)] text-[var(--rpg-text-secondary)]'
          }`}
        >
          {isLinked ? 'Linked' : 'Unlinked'}
        </span>
      </div>

      {discordUserId && (
        <p className="mb-3 text-xs text-[var(--rpg-text-secondary)]">
          Discord user ID <span className="font-bold text-[var(--rpg-text-primary)]">{discordUserId}</span>
        </p>
      )}

      {titleReward && (
        <p className="mb-3 text-xs font-bold text-[var(--rpg-gold)]">Title proof: {titleReward}</p>
      )}

      <div className="space-y-3">
        <label className="block text-xs text-[var(--rpg-text-secondary)]" htmlFor="settings-discord-link-code">
          Discord link code
        </label>
        <input
          id="settings-discord-link-code"
          type="text"
          value={code}
          maxLength={8}
          autoComplete="off"
          disabled={areClaimControlsDisabled}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'settings-discord-link-error' : undefined}
          onChange={(event) => setCode(normalizeCode(event.target.value))}
          className={inputClassName}
        />

        <button
          type="button"
          onClick={() => void handleClaim()}
          disabled={areClaimControlsDisabled || code.length !== 8}
          className={primaryButtonClassName}
        >
          <Link2 className="h-4 w-4" aria-hidden="true" />
          {isClaiming ? 'Linking Discord...' : 'Link Discord'}
        </button>
      </div>

      {error && (
        <p id="settings-discord-link-error" role="alert" className="mt-3 text-xs font-bold text-[var(--rpg-red)]">
          {error}
        </p>
      )}
    </PixelCard>
  );
}
