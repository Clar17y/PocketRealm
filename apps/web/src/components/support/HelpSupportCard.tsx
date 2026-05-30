import { AlertCircle, BookOpen, Bug, MessageCircle } from 'lucide-react';
import { PixelCard } from '@/components/PixelCard';
import { WIKI_URL } from '@/lib/supportLinks';

interface HelpSupportCardProps {
  discordUrl: string;
  knownIssuesUrl: string;
  onReportBug: () => void;
}

const linkClassName =
  'inline-flex items-center gap-2 rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] px-3 py-2 text-xs font-semibold text-[var(--rpg-text-primary)] transition-colors hover:border-[var(--rpg-gold)] hover:text-[var(--rpg-gold)]';

export function HelpSupportCard({ discordUrl, knownIssuesUrl, onReportBug }: HelpSupportCardProps) {
  return (
    <PixelCard>
      <h3 className="mb-3 text-sm font-bold text-[var(--rpg-text-primary)]">Help & Support</h3>
      <div className="flex flex-wrap gap-2">
        <a href={WIKI_URL} target="_blank" rel="noreferrer" className={linkClassName}>
          <BookOpen className="h-4 w-4" aria-hidden="true" />
          Wiki
        </a>
        {discordUrl && (
          <a href={discordUrl} target="_blank" rel="noreferrer" className={linkClassName}>
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            Discord
          </a>
        )}
        {knownIssuesUrl && (
          <a href={knownIssuesUrl} target="_blank" rel="noreferrer" className={linkClassName}>
            <AlertCircle className="h-4 w-4" aria-hidden="true" />
            Known Issues
          </a>
        )}
        <button
          type="button"
          onClick={onReportBug}
          className="inline-flex items-center gap-2 rounded bg-[var(--rpg-gold)] px-3 py-2 text-xs font-bold text-black transition-colors hover:brightness-95"
        >
          <Bug className="h-4 w-4" aria-hidden="true" />
          Report Bug
        </button>
      </div>
    </PixelCard>
  );
}
