'use client';

import Image from 'next/image';
import { Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { uiIconSrc, type UiIconName } from '@/lib/assets';

interface BottomNavProps {
  activeTab: string;
  onNavigate: (tab: string) => void;
  badgeTabs?: Set<string>;
  pulseTabs?: Set<string>;
}

interface NavItem {
  id: string;
  label: string;
  icon?: UiIconName;
  lucideIcon?: LucideIcon;
}

const navItems: NavItem[] = [
  { id: 'home', label: 'Home', icon: 'scroll' },
  { id: 'explore', label: 'Explore', icon: 'explore' },
  { id: 'inventory', label: 'Inventory', icon: 'inventory' },
  { id: 'combat', label: 'Combat', icon: 'attack' },
  { id: 'guild', label: 'Guild', lucideIcon: Users },
];

export function BottomNav({ activeTab, onNavigate, badgeTabs = new Set(), pulseTabs = new Set() }: BottomNavProps) {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-[var(--rpg-surface)] border-t border-[var(--rpg-border)] z-40 safe-area-bottom">
      <div className="max-w-lg mx-auto flex justify-around items-center h-16">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          const LucideIcon = item.lucideIcon;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={cn(
                'relative flex flex-col items-center justify-center w-full h-full transition-colors',
                isActive ? 'text-[var(--rpg-gold)]' : 'text-[var(--rpg-text-secondary)]'
              )}
            >
              {LucideIcon ? (
                <LucideIcon
                  size={40}
                  className={cn('transition-opacity', isActive ? 'opacity-100' : 'opacity-60')}
                />
              ) : item.icon ? (
                <Image
                  src={uiIconSrc(item.icon)}
                  alt={item.label}
                  width={40}
                  height={40}
                  className={cn('image-rendering-pixelated transition-opacity', isActive ? '' : 'opacity-60')}
                />
              ) : null}
              {badgeTabs.has(item.id) && (
                <span className="absolute top-1 right-1/4 w-2 h-2 rounded-full bg-[var(--rpg-red)]" />
              )}
              {pulseTabs.has(item.id) && !isActive && (
                <span className="absolute inset-0 m-auto w-10 h-10 tutorial-pulse" />
              )}
              <span className="text-xs mt-1">{item.label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
