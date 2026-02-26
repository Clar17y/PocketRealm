'use client';

import { xpRateColor } from '@/lib/format';
import { XpRateTooltip } from '@/components/common/XpRateTooltip';

interface XpRateBadgeProps {
  skillName: string;
  rate: number;
}

export function XpRateBadge({ skillName, rate }: XpRateBadgeProps) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="text-[var(--rpg-text-secondary)]">{skillName} XP Rate:</span>
      <span className="font-bold" style={{ color: xpRateColor(rate) }}>
        {rate}%
      </span>
      <XpRateTooltip />
    </div>
  );
}
