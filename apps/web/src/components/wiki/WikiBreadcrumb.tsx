'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { wikiNavigation } from '@/app/wiki/wikiNavigation';

export function WikiBreadcrumb() {
  const pathname = usePathname();

  // Don't show breadcrumb on the wiki index page
  if (pathname === '/wiki') return null;

  const segments = pathname.replace('/wiki/', '').split('/');
  const sectionSlug = segments[0];

  const section = wikiNavigation.find((s) => s.slug === sectionSlug);
  const page = section?.items.find((item) => item.href === pathname);

  return (
    <div className="wiki-breadcrumb">
      <Link href="/wiki">Wiki</Link>
      <span>/</span>
      {section && (
        <>
          <span>{section.label}</span>
          {page && (
            <>
              <span>/</span>
              <span>{page.label}</span>
            </>
          )}
        </>
      )}
    </div>
  );
}
