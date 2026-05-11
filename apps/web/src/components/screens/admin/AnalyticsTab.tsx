import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { PixelCard } from '@/components/PixelCard';
import {
  adminGetBalanceReport,
  type BalanceReport,
  type BalancePeriod,
} from '@/lib/api';
import { LatencyAnalyticsSection } from './LatencyAnalyticsSection';

const TUTORIAL_STEP_LABELS: Record<string, string> = {
  '-1': 'Skipped',
  '0': 'Welcome',
  '1': 'Starter weapon',
  '2': 'Equip',
  '3': 'Skill points',
  '4': 'Save template',
  '5': 'Attributes',
  '6': 'Explore',
  '7': 'Combat',
  '8': 'Gather',
  '9': 'Travel',
  '10': 'Refine',
  '11': 'Craft',
  '12': 'Done screen',
  '13': 'Completed',
};

function formatPercent(value: number): string {
  return `${value.toFixed(1)}%`;
}

function rateOf(count: number, total: number): number {
  return total > 0 ? (count / total) * 100 : 0;
}

function Metric({
  label,
  value,
  suffix,
}: {
  label: string;
  value: number | string;
  suffix?: string;
}) {
  return (
    <div>
      <div className="text-[var(--rpg-text-secondary)] text-xs">{label}</div>
      <div className="text-[var(--rpg-text-primary)] font-semibold">
        {typeof value === 'number' ? value.toLocaleString() : value}
        {suffix && <span className="text-[var(--rpg-text-secondary)] ml-1 font-normal">{suffix}</span>}
      </div>
    </div>
  );
}

function MetricGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">{children}</div>;
}

export function AnalyticsTab() {
  const [period, setPeriod] = useState<BalancePeriod>('7d');
  const [report, setReport] = useState<BalanceReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stale = false;
    setLoading(true);
    setError(null);

    adminGetBalanceReport(period).then((res) => {
      if (stale) return;
      if (res.error) {
        setError(res.error.message);
      } else if (res.data) {
        setReport(res.data);
      }
      setLoading(false);
    });

    return () => {
      stale = true;
    };
  }, [period]);

  const periods: BalancePeriod[] = ['1h', '24h', '7d', '30d'];

  return (
    <div className="space-y-4">
      <LatencyAnalyticsSection />

      <PixelCard>
        <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Overview</h3>
        <div className="flex items-center gap-2 flex-wrap">
          {periods.map((entry) => (
            <button
              key={entry}
              onClick={() => setPeriod(entry)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                period === entry
                  ? 'bg-[var(--rpg-gold)]/20 text-[var(--rpg-gold)] border border-[var(--rpg-gold)]/40'
                  : 'text-[var(--rpg-text-secondary)] hover:text-[var(--rpg-text-primary)]'
              }`}
            >
              {entry}
            </button>
          ))}
        </div>
        {loading && <div className="text-sm text-[var(--rpg-text-secondary)] mt-3">Loading...</div>}
        {error && <div className="text-sm text-[var(--rpg-red)] mt-3">{error}</div>}
        {report && !loading && (
          <div className="mt-4">
            <MetricGrid>
              <Metric label="Active players" value={report.activePlayers} />
              <Metric label="New players" value={report.onboarding.newPlayers} />
              <Metric label="Activated" value={formatPercent(report.onboarding.activationRate)} />
              <Metric label="Next-day retention" value={formatPercent(report.retention.nextDayRetentionRate)} />
            </MetricGrid>
          </div>
        )}
      </PixelCard>

      {report && !loading && (
        <>
          <PixelCard>
            <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Onboarding Funnel</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--rpg-text-secondary)] text-xs">
                  <th className="text-left pb-1">Step</th>
                  <th className="text-right pb-1">Players</th>
                  <th className="text-right pb-1">Rate</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: 'New accounts', count: report.onboarding.newAccounts, rate: null },
                  { label: 'New players', count: report.onboarding.newPlayers, rate: 100 },
                  { label: 'Activated', count: report.onboarding.activatedPlayers, rate: report.onboarding.activationRate },
                  { label: 'First exploration', count: report.onboarding.firstExplorationPlayers, rate: rateOf(report.onboarding.firstExplorationPlayers, report.onboarding.newPlayers) },
                  { label: 'First combat', count: report.onboarding.firstCombatPlayers, rate: rateOf(report.onboarding.firstCombatPlayers, report.onboarding.newPlayers) },
                  { label: 'First gathering', count: report.onboarding.firstGatheringPlayers, rate: rateOf(report.onboarding.firstGatheringPlayers, report.onboarding.newPlayers) },
                  { label: 'First craft', count: report.onboarding.firstCraftingPlayers, rate: rateOf(report.onboarding.firstCraftingPlayers, report.onboarding.newPlayers) },
                ].map((row) => (
                  <tr key={row.label} className="even:bg-[var(--rpg-surface-light)]/30">
                    <td className="text-[var(--rpg-text-primary)] py-0.5">{row.label}</td>
                    <td className="text-[var(--rpg-text-primary)] text-right">{row.count.toLocaleString()}</td>
                    <td className="text-[var(--rpg-text-primary)] text-right">{row.rate === null ? '-' : formatPercent(row.rate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </PixelCard>

          <PixelCard>
            <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Retention</h3>
            <MetricGrid>
              <Metric label="Active in period" value={report.retention.activeInPeriod} />
              <Metric label="Returning active" value={report.retention.returningActivePlayers} />
              <Metric label="Next-day eligible" value={report.retention.eligibleNewPlayers} />
              <Metric label="Next-day retention" value={formatPercent(report.retention.nextDayRetentionRate)} />
            </MetricGrid>
          </PixelCard>

          <PixelCard>
            <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Tutorial</h3>
            <div className="mb-4">
              <MetricGrid>
                <Metric label="Completed" value={report.tutorial.completed} suffix={formatPercent(report.tutorial.completionRate)} />
                <Metric label="Skipped" value={report.tutorial.skipped} />
                <Metric label="In progress" value={report.tutorial.inProgress} />
                <Metric label="Not started" value={report.tutorial.notStarted} />
              </MetricGrid>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--rpg-text-secondary)] text-xs">
                  <th className="text-left pb-1">Step</th>
                  <th className="text-right pb-1">Players</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(report.tutorial.byStep)
                  .sort(([a], [b]) => Number(a) - Number(b))
                  .map(([step, count]) => (
                    <tr key={step} className="even:bg-[var(--rpg-surface-light)]/30">
                      <td className="text-[var(--rpg-text-primary)] py-0.5">{TUTORIAL_STEP_LABELS[step] ?? `Step ${step}`}</td>
                      <td className="text-[var(--rpg-text-primary)] text-right">{count.toLocaleString()}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </PixelCard>

          <PixelCard>
            <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Friction</h3>
            <div className="mb-4">
              <MetricGrid>
                <Metric label="No actions after signup" value={report.friction.newPlayersWithoutActions} />
                <Metric label="Active below level 5" value={report.friction.activePlayersBelowLevel5} />
                <Metric label="Stale tutorial" value={report.friction.staleTutorialPlayers} />
              </MetricGrid>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--rpg-text-secondary)] text-xs">
                  <th className="text-left pb-1">Death Source</th>
                  <th className="text-right pb-1">Deaths</th>
                  <th className="text-right pb-1">Players</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(report.friction.deaths)
                  .sort(([, a], [, b]) => b.count - a.count)
                  .map(([source, data]) => (
                    <tr key={source} className="even:bg-[var(--rpg-surface-light)]/30">
                      <td className="text-[var(--rpg-text-primary)] py-0.5">{source}</td>
                      <td className="text-[var(--rpg-text-primary)] text-right">{data.count.toLocaleString()}</td>
                      <td className="text-[var(--rpg-text-primary)] text-right">{data.uniquePlayers.toLocaleString()}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </PixelCard>

          <PixelCard>
            <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Skill Distribution</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--rpg-text-secondary)] text-xs">
                  <th className="text-left pb-1">Skill</th>
                  <th className="text-right pb-1">Avg Level</th>
                  <th className="text-right pb-1">Median</th>
                  <th className="text-right pb-1">P90</th>
                  <th className="text-right pb-1">Players</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(report.skillDistribution)
                  .sort(([, a], [, b]) => b.avg - a.avg)
                  .map(([skill, data]) => (
                    <tr key={skill} className="even:bg-[var(--rpg-surface-light)]/30">
                      <td className="text-[var(--rpg-text-primary)] py-0.5 capitalize">{skill}</td>
                      <td className="text-[var(--rpg-text-primary)] text-right">{data.avg.toFixed(1)}</td>
                      <td className="text-[var(--rpg-text-primary)] text-right">{data.median.toFixed(1)}</td>
                      <td className="text-[var(--rpg-text-primary)] text-right">{data.p90.toFixed(1)}</td>
                      <td className="text-[var(--rpg-text-primary)] text-right">{data.playerCount}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </PixelCard>

          <PixelCard>
            <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Turn Distribution</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--rpg-text-secondary)] text-xs">
                  <th className="text-left pb-1">Activity</th>
                  <th className="text-right pb-1">Total Turns</th>
                  <th className="text-right pb-1">Actions</th>
                  <th className="text-right pb-1">Players</th>
                  <th className="text-right pb-1">Avg Turns/Action</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(report.turnDistribution)
                  .sort(([, a], [, b]) => b.totalTurns - a.totalTurns)
                  .map(([activity, data]) => (
                    <tr key={activity} className="even:bg-[var(--rpg-surface-light)]/30">
                      <td className="text-[var(--rpg-text-primary)] py-0.5 capitalize">{activity}</td>
                      <td className="text-[var(--rpg-text-primary)] text-right">{data.totalTurns.toLocaleString()}</td>
                      <td className="text-[var(--rpg-text-primary)] text-right">{data.actionCount.toLocaleString()}</td>
                      <td className="text-[var(--rpg-text-primary)] text-right">{data.uniquePlayers.toLocaleString()}</td>
                      <td className="text-[var(--rpg-text-primary)] text-right">{data.avgTurnsPerAction.toFixed(1)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </PixelCard>

          <PixelCard>
            <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">XP Efficiency</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--rpg-text-secondary)] text-xs">
                  <th className="text-left pb-1">Category</th>
                  <th className="text-right pb-1">Total XP</th>
                  <th className="text-right pb-1">Total Turns</th>
                  <th className="text-right pb-1">XP/Turn</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(report.xpEfficiency)
                  .sort(([, a], [, b]) => b.xpPerTurn - a.xpPerTurn)
                  .map(([category, data]) => (
                    <tr key={category} className="even:bg-[var(--rpg-surface-light)]/30">
                      <td className="text-[var(--rpg-text-primary)] py-0.5 capitalize">{category}</td>
                      <td className="text-[var(--rpg-text-primary)] text-right">{data.totalXpGained.toLocaleString()}</td>
                      <td className="text-[var(--rpg-text-primary)] text-right">{data.totalTurnsSpent.toLocaleString()}</td>
                      <td className="text-[var(--rpg-text-primary)] text-right">{data.xpPerTurn.toFixed(2)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </PixelCard>

          <PixelCard>
            <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Progression Velocity</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--rpg-text-secondary)] text-xs">
                  <th className="text-left pb-1">Skill</th>
                  <th className="text-right pb-1">Lv5+</th>
                  <th className="text-right pb-1">Lv10+</th>
                  <th className="text-right pb-1">Lv15+</th>
                  <th className="text-right pb-1">Lv20+</th>
                  <th className="text-right pb-1">Lv30+</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(report.progressionVelocity)
                  .sort(([, a], [, b]) => b.atLevel10 - a.atLevel10)
                  .map(([skill, data]) => (
                    <tr key={skill} className="even:bg-[var(--rpg-surface-light)]/30">
                      <td className="text-[var(--rpg-text-primary)] py-0.5 capitalize">{skill}</td>
                      <td className="text-[var(--rpg-text-primary)] text-right">{data.atLevel5.toFixed(1)}%</td>
                      <td className="text-[var(--rpg-text-primary)] text-right">{data.atLevel10.toFixed(1)}%</td>
                      <td className="text-[var(--rpg-text-primary)] text-right">{data.atLevel15.toFixed(1)}%</td>
                      <td className="text-[var(--rpg-text-primary)] text-right">{data.atLevel20.toFixed(1)}%</td>
                      <td className="text-[var(--rpg-text-primary)] text-right">{data.atLevel30.toFixed(1)}%</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </PixelCard>

          <PixelCard>
            <h3 className="text-sm font-semibold text-[var(--rpg-gold)] mb-3">Zone Activity</h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[var(--rpg-text-secondary)] text-xs">
                  <th className="text-left pb-1">Zone</th>
                  <th className="text-right pb-1">Total Turns</th>
                  <th className="text-right pb-1">Actions</th>
                  <th className="text-right pb-1">Unique Players</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(report.zoneActivity)
                  .sort(([, a], [, b]) => b.totalTurns - a.totalTurns)
                  .map(([zone, data]) => (
                    <tr key={zone} className="even:bg-[var(--rpg-surface-light)]/30">
                      <td className="text-[var(--rpg-text-primary)] py-0.5">{zone}</td>
                      <td className="text-[var(--rpg-text-primary)] text-right">{data.totalTurns.toLocaleString()}</td>
                      <td className="text-[var(--rpg-text-primary)] text-right">{data.actionCount.toLocaleString()}</td>
                      <td className="text-[var(--rpg-text-primary)] text-right">{data.uniquePlayers}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </PixelCard>
        </>
      )}
    </div>
  );
}
