'use client';

import { useEffect, useState } from 'react';
import { INVENTORY_CONSTANTS, PREMIUM_CONSTANTS } from '@pocketrealm/shared';
import { PixelCard } from '@/components/PixelCard';
import { ChampionBadge } from '@/components/common/ChampionBadge';
import { confirmPremiumCheckout, createPremiumCheckout, getPremiumPurchases, getPremiumStatus } from '@/lib/api';
import { SUPPORT_CARRY_FORWARD_COPY } from '@/lib/supportCopy';

interface SupportPocketrealmCardProps {
  initialIsPremium: boolean;
  initialPremiumExpiresAt: string | null;
}

interface PremiumPurchaseSummary {
  id: string;
  championDaysGranted: number;
  grantedUntil: string;
  createdAt: string;
}

const CHAMPION_BONUS_PERCENT = Math.round((PREMIUM_CONSTANTS.BONUS_MULTIPLIER - 1) * 100);

const CHAMPION_PERKS = [
  `+${CHAMPION_BONUS_PERCENT}% turn regen and turn bank cap`,
  `+${INVENTORY_CONSTANTS.CHAMPION_BONUS_SLOTS} backpack slots`,
  `${PREMIUM_CONSTANTS.TEMPLATE_LIMIT_CHAMPION} combat templates (${PREMIUM_CONSTANTS.TEMPLATE_LIMIT_FREE} free)`,
  `+${CHAMPION_BONUS_PERCENT}% crafting, gathering, hidden caches, and boss rewards`,
  `Unlock the Champion title`,
] as const;

function formatDate(value: string | null): string | null {
  if (!value) {
    return null;
  }

  return new Date(value).toLocaleDateString();
}

function formatStatus(isPremium: boolean, premiumExpiresAt: string | null): string {
  if (!isPremium || !premiumExpiresAt) {
    return 'Free account';
  }

  return `Champion until ${new Date(premiumExpiresAt).toLocaleString()}`;
}

export function SupportPocketrealmCard({
  initialIsPremium,
  initialPremiumExpiresAt,
}: SupportPocketrealmCardProps) {
  const [isPremium, setIsPremium] = useState(initialIsPremium);
  const [premiumExpiresAt, setPremiumExpiresAt] = useState(initialPremiumExpiresAt);
  const [purchases, setPurchases] = useState<PremiumPurchaseSummary[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);

  useEffect(() => {
    setIsPremium(initialIsPremium);
    setPremiumExpiresAt(initialPremiumExpiresAt);
  }, [initialIsPremium, initialPremiumExpiresAt]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      const supportState = searchParams.get('support');
      const sessionId = searchParams.get('session_id');

      if (supportState === 'success' && sessionId) {
        const confirmRes = await confirmPremiumCheckout(sessionId);

        if (cancelled) {
          return;
        }

        if (!confirmRes.data?.premium) {
          setError(confirmRes.error?.message ?? 'Failed to confirm support purchase.');
        } else {
          setIsPremium(confirmRes.data.premium.isPremium);
          setPremiumExpiresAt(confirmRes.data.premium.premiumExpiresAt);
          setShowSuccessDialog(true);
        }

        searchParams.delete('support');
        searchParams.delete('session_id');
        const nextSearch = searchParams.toString();
        const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
        window.history.replaceState({}, '', nextUrl);
      }

      const [statusRes, purchasesRes] = await Promise.all([
        getPremiumStatus(),
        getPremiumPurchases(),
      ]);

      if (cancelled) {
        return;
      }

      if (statusRes.data?.premium) {
        setIsPremium(statusRes.data.premium.isPremium);
        setPremiumExpiresAt(statusRes.data.premium.premiumExpiresAt);
      }

      if (purchasesRes.data?.purchases) {
        setPurchases(purchasesRes.data.purchases);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSupport = async () => {
    setBusy(true);
    setError(null);
    setShowSuccessDialog(false);

    const res = await createPremiumCheckout();

    if (!res.data?.url) {
      setBusy(false);
      setError(res.error?.message ?? 'Failed to start checkout.');
      return;
    }

    window.location.href = res.data.url;
  };

  const purchaseRows = purchases.slice(0, 5);

  return (
    <PixelCard>
      {showSuccessDialog && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/65 px-4"
          role="dialog"
          aria-modal="true"
          aria-label="Support Pocketrealm success"
        >
          <div className="w-full max-w-md rounded-lg border border-[var(--rpg-gold)]/60 bg-[var(--rpg-surface)] p-5 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--rpg-gold)]/15 text-2xl animate-pulse">
                ✨
              </div>
              <div>
                <p className="text-lg font-bold text-[var(--rpg-text-primary)]">Thanks for supporting Pocketrealm</p>
                <p className="text-sm text-[var(--rpg-text-secondary)]">
                  Champion is active and your support helps keep the game online.
                </p>
              </div>
            </div>

            <div className="rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)]/70 px-3 py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-[var(--rpg-text-secondary)]">
                Unlocked now
              </p>
              <p className="mt-2 text-sm font-bold text-[var(--rpg-text-primary)]">
                Champion title is now available in Achievements
              </p>
              <p className="mt-1 text-xs text-[var(--rpg-text-secondary)]">
                Your {PREMIUM_CONSTANTS.SUPPORT_DURATION_DAYS} days of Champion time have been applied and will stack with future support purchases.
              </p>
              <p className="mt-1 text-xs text-[var(--rpg-text-secondary)]">
                {SUPPORT_CARRY_FORWARD_COPY}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowSuccessDialog(false)}
              className="mt-4 w-full rounded bg-[var(--rpg-gold)] px-4 py-2 text-sm font-bold text-black transition-colors hover:brightness-95"
            >
              Continue
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 mb-2">
        <ChampionBadge size="sm" />
        <h3 className="text-sm font-bold text-[var(--rpg-text-primary)]">Support Pocketrealm</h3>
      </div>

      <p className="text-xs text-[var(--rpg-text-secondary)] mb-2">
        One-time purchase. Grants {PREMIUM_CONSTANTS.SUPPORT_DURATION_DAYS} days of Champion. Stacks if purchased again.
      </p>
      <p className="text-xs text-[var(--rpg-text-secondary)] mb-3">
        {SUPPORT_CARRY_FORWARD_COPY}
      </p>
      <div className="mb-4 rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)]/60 px-3 py-3">
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--rpg-text-secondary)]">
          Status
        </p>
        <p className="mt-2 text-base font-bold text-[var(--rpg-text-primary)]">
          {formatStatus(isPremium, premiumExpiresAt)}
        </p>
      </div>

      <div className="mb-4 rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)]/60 px-3 py-3">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--rpg-text-secondary)]">
          Champion perks
        </p>
        <div className="space-y-1.5">
          {CHAMPION_PERKS.map((perk) => (
            <p key={perk} className="text-xs text-[var(--rpg-text-secondary)]">
              {perk}
            </p>
          ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => void handleSupport()}
        disabled={busy}
        className="rounded bg-[var(--rpg-gold)] px-4 py-2 text-xs font-bold text-black transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? 'Opening Checkout...' : 'Support Pocketrealm'}
      </button>

      {error && <p className="mt-3 text-xs font-bold text-[var(--rpg-red)]">{error}</p>}

      <div className="mt-4 border-t border-[var(--rpg-border)] pt-3">
        <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--rpg-text-secondary)]">
          Recent Support
        </p>
        {purchaseRows.length === 0 ? (
          <p className="text-xs text-[var(--rpg-text-secondary)]">No support purchases yet.</p>
        ) : (
          <div className="space-y-1">
            {purchaseRows.map((purchase) => (
              <p key={purchase.id} className="text-xs text-[var(--rpg-text-secondary)]">
                {formatDate(purchase.createdAt)} - {purchase.championDaysGranted} days (until {formatDate(purchase.grantedUntil)})
              </p>
            ))}
          </div>
        )}
      </div>
    </PixelCard>
  );
}
