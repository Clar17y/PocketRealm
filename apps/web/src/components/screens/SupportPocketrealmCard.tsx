'use client';

import { useEffect, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import { ChampionBadge } from '@/components/common/ChampionBadge';
import { createPremiumCheckout, getPremiumPurchases, getPremiumStatus } from '@/lib/api';

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

  useEffect(() => {
    setIsPremium(initialIsPremium);
    setPremiumExpiresAt(initialPremiumExpiresAt);
  }, [initialIsPremium, initialPremiumExpiresAt]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
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
      <div className="flex items-center gap-2 mb-2">
        <ChampionBadge size="sm" />
        <h3 className="text-sm font-bold text-[var(--rpg-text-primary)]">Support Pocketrealm</h3>
      </div>

      <p className="text-xs text-[var(--rpg-text-secondary)] mb-2">
        One-time purchase. Grants 30 days of Champion. Stacks if purchased again.
      </p>
      <p className="text-xs text-[var(--rpg-text-secondary)] mb-4">
        {formatStatus(isPremium, premiumExpiresAt)}
      </p>

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
