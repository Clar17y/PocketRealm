import { changelog } from '@/lib/changelog';

interface ChangelogModalProps {
  onDismiss: () => void;
}

export function ChangelogModal({ onDismiss }: ChangelogModalProps) {
  const [latest, ...older] = changelog;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-[var(--rpg-bg-dark,#1a1a2e)] border border-[var(--rpg-gold,#c8a84e)] rounded-lg p-6 max-w-md w-full mx-4 max-h-[80vh] flex flex-col">
        <h2 className="text-[var(--rpg-gold,#c8a84e)] font-bold text-lg mb-4">
          What&apos;s New
        </h2>

        <div className="overflow-y-auto flex-1 space-y-4 pr-1">
          {/* Latest entry — prominent */}
          {latest && (
            <div>
              <div className="flex items-baseline gap-2 mb-1">
                <span className="text-[var(--rpg-gold)] font-semibold">{latest.title}</span>
                <span className="text-xs text-[var(--rpg-text-secondary)]">v{latest.version}</span>
              </div>
              <p className="text-xs text-[var(--rpg-text-secondary)] mb-1">{latest.date}</p>
              <p className="text-sm text-[var(--rpg-text-primary)] leading-relaxed">{latest.summary}</p>
            </div>
          )}

          {/* Older entries — dimmed */}
          {older.length > 0 && (
            <>
              <hr className="border-[var(--rpg-border)]" />
              {older.map((entry) => (
                <div key={entry.version} className="opacity-60">
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="text-[var(--rpg-gold)] font-semibold text-sm">{entry.title}</span>
                    <span className="text-xs text-[var(--rpg-text-secondary)]">v{entry.version}</span>
                  </div>
                  <p className="text-xs text-[var(--rpg-text-secondary)] mb-1">{entry.date}</p>
                  <p className="text-sm text-[var(--rpg-text-primary)] leading-relaxed">{entry.summary}</p>
                </div>
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
    </div>
  );
}
