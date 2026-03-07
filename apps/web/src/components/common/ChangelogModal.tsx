import { changelog, type ChangelogEntry } from '@/lib/changelog';
import { ModalOverlay } from './ModalOverlay';

interface ChangelogModalProps {
  onDismiss: () => void;
}

function ChangelogEntryItem({ entry, dimmed }: { entry: ChangelogEntry; dimmed?: boolean }) {
  return (
    <div className={dimmed ? 'opacity-60' : undefined}>
      <div className="flex items-baseline gap-2 mb-1">
        <span className={`text-[var(--rpg-gold)] font-semibold${dimmed ? ' text-sm' : ''}`}>{entry.title}</span>
        <span className="text-xs text-[var(--rpg-text-secondary)]">v{entry.version}</span>
      </div>
      <p className="text-xs text-[var(--rpg-text-secondary)] mb-1">{entry.date}</p>
      <p className="text-sm text-[var(--rpg-text-primary)] leading-relaxed">{entry.summary}</p>
    </div>
  );
}

export function ChangelogModal({ onDismiss }: ChangelogModalProps) {
  const [latest, ...older] = changelog;

  return (
    <ModalOverlay>
      <div className="bg-[var(--rpg-surface)] border border-[var(--rpg-gold)] rounded-lg p-6 max-w-md w-full mx-4 max-h-[80vh] flex flex-col">
        <h2 className="text-[var(--rpg-gold)] font-bold text-lg mb-4">
          What&apos;s New
        </h2>

        <div className="overflow-y-auto flex-1 space-y-4 pr-1">
          {latest && <ChangelogEntryItem entry={latest} />}

          {older.length > 0 && (
            <>
              <hr className="border-[var(--rpg-border)]" />
              {older.map((entry) => (
                <ChangelogEntryItem key={entry.version} entry={entry} dimmed />
              ))}
            </>
          )}
        </div>

        <button
          className="mt-4 w-full bg-[var(--rpg-gold)] hover:bg-[#e4b85b] text-[var(--rpg-background)] rounded-lg font-semibold py-2 transition-all"
          onClick={onDismiss}
        >
          Got it
        </button>
      </div>
    </ModalOverlay>
  );
}
