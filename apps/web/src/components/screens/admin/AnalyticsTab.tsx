import { useEffect, useState } from 'react';
import { PixelCard } from '@/components/PixelCard';
import {
  adminGetBalanceReport,
  type BalanceReport,
  type BalancePeriod,
} from '@/lib/api';
import { LatencyAnalyticsSection } from './LatencyAnalyticsSection';

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
          <div className="mt-3 text-sm text-[var(--rpg-text-primary)]">
            <span className="font-semibold">{report.activePlayers}</span>
            <span className="text-[var(--rpg-text-secondary)] ml-1">active players</span>
          </div>
        )}
      </PixelCard>

      {report && !loading && (
        <>
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
