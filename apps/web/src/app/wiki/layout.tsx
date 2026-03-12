import type { Metadata } from 'next';
import { WikiSidebar } from '@/components/wiki/WikiSidebar';
import { WikiMobileToggle } from '@/components/wiki/WikiMobileToggle';
import { WikiBreadcrumb } from '@/components/wiki/WikiBreadcrumb';
import './wiki.css';

export const metadata: Metadata = {
  title: {
    template: '%s | Pocketrealm Wiki',
    default: 'Pocketrealm Wiki',
  },
  description:
    'Complete game mechanics reference for Pocketrealm — every formula, constant, and calculation explained.',
};

export default function WikiLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="wiki-layout">
      <div className="hidden md:block">
        <WikiSidebar />
      </div>
      <div className="md:hidden">
        <WikiMobileToggle />
      </div>
      <main className="wiki-content">
        <WikiBreadcrumb />
        {children}
      </main>
    </div>
  );
}
