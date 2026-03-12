'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { wikiNavigation } from '@/app/wiki/wikiNavigation';

interface WikiSidebarProps {
  open?: boolean;
  onClose?: () => void;
  mobile?: boolean;
}

export function WikiSidebar({ open, onClose, mobile }: WikiSidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const toggle = (slug: string) => {
    setCollapsed((prev) => ({ ...prev, [slug]: !prev[slug] }));
  };

  const sidebarClass = mobile
    ? `wiki-sidebar wiki-sidebar--mobile`
    : 'wiki-sidebar';

  return (
    <nav
      className={sidebarClass}
      data-open={open}
    >
      <Link href="/wiki" className="wiki-sidebar-title" onClick={onClose} style={{ display: 'block', textDecoration: 'none' }}>
        Pocketrealm Wiki
      </Link>

      {wikiNavigation.map((section) => {
        const isCollapsed = collapsed[section.slug] ?? false;
        const isActive = pathname.startsWith(`/wiki/${section.slug}`);
        const firstHref = section.items[0]?.href ?? `/wiki/${section.slug}`;
        return (
          <div key={section.slug}>
            <div className="wiki-sidebar-section-label">
              <Link
                href={firstHref}
                onClick={onClose}
                style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'inherit', textDecoration: 'none', flex: 1 }}
                data-section-active={isActive}
              >
                <span>{section.icon}</span>
                <span>{section.label}</span>
              </Link>
              <button
                onClick={() => toggle(section.slug)}
                aria-expanded={!isCollapsed}
                style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: '0.6rem', padding: '0 4px' }}
              >
                {isCollapsed ? '\u25B6' : '\u25BC'}
              </button>
            </div>

            {!isCollapsed && (
              <div>
                {section.items.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="wiki-sidebar-link"
                    data-active={pathname === item.href}
                    onClick={onClose}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
