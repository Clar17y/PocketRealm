import { useEffect, useState } from 'react';
import { PixelButton } from '@/components/PixelButton';
import { PixelCard } from '@/components/PixelCard';
import {
  adminActivateSeason,
  adminBootstrapSeason,
  adminCreateSeason,
  adminEndSeason,
  adminEvaluateSeasonRewards,
  adminGetSeasons,
  adminMergeSeason,
  type AdminSeason,
} from '@/lib/api';
import { StatusMsg } from './StatusMsg';
import { useAdminAction } from './useAdminAction';

function toIsoDateTime(value: string): string {
  return new Date(value).toISOString();
}

export function SeasonsTab() {
  const [seasons, setSeasons] = useState<AdminSeason[]>([]);
  const [name, setName] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [features, setFeatures] = useState('');
  const [loading, setLoading] = useState(false);
  const { busy, msg, act } = useAdminAction();

  const loadSeasons = async () => {
    setLoading(true);
    try {
      const res = await adminGetSeasons();
      if (res.data) {
        setSeasons(res.data.seasons);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSeasons();
  }, []);

  const refreshAfter = async <T,>(promise: Promise<T | null>) => {
    const result = await promise;
    if (result) {
      await loadSeasons();
    }
    return result;
  };

  return (
    <div className="space-y-4">
      <PixelCard>
        <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Create Season</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm text-[var(--rpg-text-primary)]">
            <span className="block text-xs text-[var(--rpg-text-secondary)] mb-1">Season name</span>
            <input
              aria-label="Season name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm w-full text-[var(--rpg-text-primary)]"
            />
          </label>
          <label className="text-sm text-[var(--rpg-text-primary)]">
            <span className="block text-xs text-[var(--rpg-text-secondary)] mb-1">Features</span>
            <input
              aria-label="Features"
              value={features}
              onChange={(event) => setFeatures(event.target.value)}
              placeholder="comma,separated,features"
              className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm w-full text-[var(--rpg-text-primary)]"
            />
          </label>
          <label className="text-sm text-[var(--rpg-text-primary)]">
            <span className="block text-xs text-[var(--rpg-text-secondary)] mb-1">Starts at</span>
            <input
              aria-label="Starts at"
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm w-full text-[var(--rpg-text-primary)]"
            />
          </label>
          <label className="text-sm text-[var(--rpg-text-primary)]">
            <span className="block text-xs text-[var(--rpg-text-secondary)] mb-1">Ends at</span>
            <input
              aria-label="Ends at"
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
              className="bg-[var(--rpg-surface)] border border-[var(--rpg-border)] rounded px-2 py-1 text-sm w-full text-[var(--rpg-text-primary)]"
            />
          </label>
        </div>
        <PixelButton
          size="sm"
          className="mt-3"
          disabled={busy || !name.trim() || !startsAt || !endsAt}
          onClick={async () => {
            const featureList = features
              .split(',')
              .map((feature) => feature.trim())
              .filter(Boolean);
            const created = await refreshAfter(act('Create season', () => adminCreateSeason({
              name: name.trim(),
              startsAt: toIsoDateTime(startsAt),
              endsAt: toIsoDateTime(endsAt),
              ...(featureList.length > 0 ? { features: featureList } : {}),
            })));

            if (created) {
              setName('');
              setStartsAt('');
              setEndsAt('');
              setFeatures('');
            }
          }}
        >
          Create Season
        </PixelButton>
      </PixelCard>

      <PixelCard>
        <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Season List</h3>
        {loading && <div className="text-sm text-[var(--rpg-text-secondary)]">Loading...</div>}
        {!loading && seasons.length === 0 && (
          <div className="text-sm text-[var(--rpg-text-secondary)]">No seasons found.</div>
        )}
        <div className="space-y-3">
          {seasons.map((season) => (
            <div
              key={season.id}
              data-testid={`season-row-${season.id}`}
              className="rounded border border-[var(--rpg-border)] bg-[var(--rpg-surface)] px-3 py-2"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-almendra text-lg text-[var(--rpg-text-primary)]">{season.name}</div>
                  <div className="text-xs text-[var(--rpg-text-secondary)]">
                    {season.status} | {season.isBootstrapped ? 'bootstrapped' : 'not bootstrapped'}
                  </div>
                  <div className="text-xs text-[var(--rpg-text-secondary)] mt-1">
                    {season.startsAt} to {season.endsAt}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!season.isBootstrapped && (
                    <PixelButton
                      size="sm"
                      disabled={busy}
                      onClick={() => void refreshAfter(act('Bootstrap season', () => adminBootstrapSeason(season.id)))}
                    >
                      Bootstrap
                    </PixelButton>
                  )}
                  <PixelButton
                    size="sm"
                    disabled={busy}
                    onClick={() => void refreshAfter(act(
                      'Activate season',
                      () => adminActivateSeason(season.id),
                      `Activate season "${season.name}"?`,
                    ))}
                  >
                    Activate
                  </PixelButton>
                  <PixelButton
                    size="sm"
                    disabled={busy}
                    onClick={() => void refreshAfter(act(
                      'End season',
                      () => adminEndSeason(season.id),
                      `End season "${season.name}"?`,
                    ))}
                  >
                    End Season
                  </PixelButton>
                  <PixelButton
                    size="sm"
                    disabled={busy}
                    onClick={() => void refreshAfter(act(
                      'Evaluate rewards',
                      () => adminEvaluateSeasonRewards(season.id),
                      `Evaluate rewards for "${season.name}"?`,
                    ))}
                  >
                    Evaluate Rewards
                  </PixelButton>
                  <PixelButton
                    size="sm"
                    disabled={busy}
                    onClick={() => void refreshAfter(act(
                      'Merge season',
                      () => adminMergeSeason(season.id),
                      `Merge season "${season.name}" into the permanent realm?`,
                    ))}
                  >
                    Merge Season
                  </PixelButton>
                </div>
              </div>
            </div>
          ))}
        </div>
      </PixelCard>

      <StatusMsg msg={msg} />
    </div>
  );
}
