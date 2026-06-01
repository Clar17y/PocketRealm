'use client';

import { useState } from 'react';
import { AlertCircle, BookOpen, Bug, HelpCircle, MessageCircle } from 'lucide-react';
import { WIKI_URL } from '@/lib/supportLinks';

interface HelpSupportMenuProps {
  discordUrl: string;
  knownIssuesUrl: string;
  onReportBug: () => void;
}

const menuItemClassName =
  'flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-[var(--rpg-text-primary)] transition-colors hover:bg-[var(--rpg-background)]';
const triggerClassName =
  'relative flex h-6 w-6 items-center justify-center text-[var(--rpg-text-secondary)] transition-colors hover:text-[var(--rpg-gold)]';

export function HelpSupportMenu({ discordUrl, knownIssuesUrl, onReportBug }: HelpSupportMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) {
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        aria-label="Help and support"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
        className={triggerClassName}
      >
        <HelpCircle className="h-4 w-4" aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 min-w-[180px] overflow-hidden rounded-lg border border-[var(--rpg-border)] bg-[var(--rpg-surface)] shadow-lg"
        >
          <a role="menuitem" href={WIKI_URL} target="_blank" rel="noreferrer" className={menuItemClassName}>
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            Wiki
          </a>
          {discordUrl && (
            <a role="menuitem" href={discordUrl} target="_blank" rel="noreferrer" className={menuItemClassName}>
              <MessageCircle className="h-4 w-4" aria-hidden="true" />
              Discord
            </a>
          )}
          {knownIssuesUrl && (
            <a role="menuitem" href={knownIssuesUrl} target="_blank" rel="noreferrer" className={menuItemClassName}>
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              Known Issues
            </a>
          )}
          <button
            role="menuitem"
            type="button"
            onClick={() => {
              setOpen(false);
              onReportBug();
            }}
            className={`${menuItemClassName} font-semibold text-[var(--rpg-gold)]`}
          >
            <Bug className="h-4 w-4" aria-hidden="true" />
            Report Bug
          </button>
        </div>
      )}
    </div>
  );
}
