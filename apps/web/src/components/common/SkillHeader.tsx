'use client';

import { xpRateColor } from '@/lib/format';
import { XpRateTooltip } from '@/components/common/XpRateTooltip';

interface SkillHeaderProps {
  skillName: string;
  skillLevel: number;
  xpRate: number;
}

export function SkillHeader({ skillName, skillLevel, xpRate }: SkillHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold font-almendra text-[var(--rpg-text-primary)]">{skillName}</h2>
        <div className="px-2 py-1 bg-[var(--rpg-gold)] rounded text-[var(--rpg-background)] text-[12px] font-pixel">
          Lv. {skillLevel}
        </div>
      </div>
      <div className="text-right">
        <div className="text-xs text-[var(--rpg-text-secondary)] flex items-center justify-end gap-1">
          XP Rate
          <XpRateTooltip />
        </div>
        <div className="text-[12px] font-pixel" style={{ color: xpRateColor(xpRate) }}>{xpRate}%</div>
      </div>
    </div>
  );
}
