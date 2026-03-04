import { PixelCard } from '@/components/PixelCard';
import { StatBar } from '@/components/StatBar';
import { XpRateTooltip } from '@/components/common/XpRateTooltip';
import { xpRateColor } from '@/lib/format';
import Image from 'next/image';
import type { LucideIcon } from 'lucide-react';

interface SkillCardProps {
  name: string;
  icon?: LucideIcon;
  imageSrc?: string;
  level: number;
  currentXP: number;
  nextLevelXP: number;
  xpRate: number;
  iconColor?: string;
}

export function SkillCard({
  name,
  icon: Icon,
  imageSrc,
  level,
  currentXP,
  nextLevelXP,
  xpRate,
  iconColor = 'var(--rpg-gold)',
}: SkillCardProps) {
  return (
    <PixelCard className="flex items-center gap-4">
      <div
        className="w-16 h-16 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: 'var(--rpg-background)' }}
      >
        {imageSrc ? (
          <div className="relative w-12 h-12 flex-shrink-0">
            <Image
              src={imageSrc}
              alt={name}
              fill
              sizes="48px"
              loading="eager"
              className="object-contain image-rendering-pixelated"
            />
          </div>
        ) : Icon ? (
          <Icon size={32} style={{ color: iconColor }} />
        ) : null}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between mb-1">
          <h3 className="font-semibold font-display text-[var(--rpg-text-primary)]">{name}</h3>
          <span className="text-2xl font-bold text-[var(--rpg-gold)] ml-2 font-pixel">
            {level}
          </span>
        </div>
        <StatBar current={currentXP} max={nextLevelXP} color="xp" size="sm" showNumbers={false} />
        <div className="flex justify-between items-center mt-1">
          <span className="text-xs text-[var(--rpg-text-secondary)] font-pixel">
            {currentXP.toLocaleString()} / {nextLevelXP.toLocaleString()} XP
          </span>
          <span className="text-xs flex items-center gap-1" style={{ color: xpRateColor(xpRate) }}>
            XP Rate: {xpRate}%
            <XpRateTooltip />
          </span>
        </div>
      </div>
    </PixelCard>
  );
}
