'use client';

import type { LucideIcon } from 'lucide-react';
import { SkillCard } from '@/components/SkillCard';

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
    <div className="rpg-screen-enter space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-[var(--rpg-text-primary)]">Skills</h2>
        <div className="text-sm text-[var(--rpg-text-secondary)]">
          Total Level: {skills.reduce((sum, skill) => sum + skill.level, 0)}
        </div>
      </div>

      <div className="space-y-3">
        {skills.map((skill, index) => (
          <div key={skill.id} className="rpg-stagger-item" style={{ animationDelay: `${Math.min(index * 40, 400)}ms` }}>
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
    </div>
  );
}
