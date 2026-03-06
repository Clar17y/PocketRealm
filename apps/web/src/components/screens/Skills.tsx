'use client';

import type { LucideIcon } from 'lucide-react';
import { SkillCard } from '@/components/SkillCard';
import { Divider } from '@/components/common/Divider';
import { getStaggerDelay } from '@/lib/animations';
import { ScreenContainer } from '../common/ScreenContainer';

interface Skill {
  id: string;
  name: string;
  icon?: LucideIcon;
  imageSrc?: string;
  level: number;
  currentXP: number;
  nextLevelXP: number;
  xpRate: number;
  color: string;
}

interface SkillsProps {
  skills: Skill[];
}

export function Skills({ skills }: SkillsProps) {
  return (
    <ScreenContainer>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold font-almendra text-[var(--rpg-text-primary)]">Skills</h2>
        <div className="text-sm text-[var(--rpg-text-secondary)]">
          Total Level: <span className="font-pixel text-[12px]">{skills.reduce((sum, skill) => sum + skill.level, 0)}</span>
        </div>
      </div>

      <Divider className="my-1" />

      <div className="space-y-3">
        {skills.map((skill, index) => (
          <div key={skill.id} className="rpg-stagger-item" style={{ animationDelay: getStaggerDelay(index) }}>
            <SkillCard
              name={skill.name}
              icon={skill.icon}
              imageSrc={skill.imageSrc}
              level={skill.level}
              currentXP={skill.currentXP}
              nextLevelXP={skill.nextLevelXP}
              xpRate={skill.xpRate}
              iconColor={skill.color}
            />
          </div>
        ))}
      </div>
    </ScreenContainer>
  );
}
