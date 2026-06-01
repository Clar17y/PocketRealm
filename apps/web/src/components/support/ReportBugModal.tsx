'use client';

import { useId, useState, type FormEvent } from 'react';
import type { CreateSupportTicketRequest, SupportTicketArea, SupportTicketPrivacy } from '@/lib/api';
import { ModalOverlay } from '@/components/common/ModalOverlay';

interface ReportBugModalProps {
  open: boolean;
  currentScreen: string;
  onClose: () => void;
  onSubmit: (input: CreateSupportTicketRequest) => Promise<{ publicId: string }>;
}

const AREA_OPTIONS: Array<{ value: SupportTicketArea; label: string }> = [
  { value: 'combat', label: 'Combat' },
  { value: 'exploration', label: 'Exploration' },
  { value: 'crafting', label: 'Crafting' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'social', label: 'Social' },
  { value: 'guild', label: 'Guild' },
  { value: 'casino', label: 'Casino' },
  { value: 'payments', label: 'Payments' },
  { value: 'auth', label: 'Login or account' },
  { value: 'mobile', label: 'Mobile' },
  { value: 'performance', label: 'Performance' },
  { value: 'other', label: 'Other' },
];

const PRIVACY_OPTIONS: Array<{ value: SupportTicketPrivacy; label: string }> = [
  { value: 'not_sure', label: 'Not sure' },
  { value: 'public_candidate', label: 'Safe to discuss publicly' },
  { value: 'private', label: 'Private or sensitive' },
];
const TITLE_MIN_LENGTH = 5;
const DESCRIPTION_MIN_LENGTH = 10;

function getBrowserContext(): string | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.userAgent;
}

export function ReportBugModal({ open, currentScreen, onClose, onSubmit }: ReportBugModalProps) {
  const fieldId = useId();
  const [privacy, setPrivacy] = useState<SupportTicketPrivacy>('not_sure');
  const [area, setArea] = useState<SupportTicketArea>('other');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [reproductionSteps, setReproductionSteps] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const trimmedTitle = title.trim();
  const trimmedDescription = description.trim();
  const trimmedSteps = reproductionSteps.trim();
  const titleNeedsMoreDetail = trimmedTitle.length < TITLE_MIN_LENGTH;
  const descriptionNeedsMoreDetail = trimmedDescription.length < DESCRIPTION_MIN_LENGTH;
  const canSubmit = !busy && !titleNeedsMoreDetail && !descriptionNeedsMoreDetail;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;

    setBusy(true);
    setSuccess(null);
    setError(null);

    try {
      const response = await onSubmit({
        privacy,
        category: 'bug',
        area,
        title: trimmedTitle,
        description: trimmedDescription,
        reproductionSteps: trimmedSteps || undefined,
        screen: currentScreen,
        appVersion: process.env.NEXT_PUBLIC_APP_VERSION,
        browser: getBrowserContext(),
      });
      setSuccess(`Report ${response.publicId} created`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Failed to submit report.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ModalOverlay opacity={80} onClose={busy ? undefined : onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${fieldId}-title`}
        className="mx-4 flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg border border-[var(--rpg-gold)] bg-[var(--rpg-surface)] p-5 shadow-xl"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 id={`${fieldId}-title`} className="text-lg font-bold text-[var(--rpg-gold)]">
            Report Bug
          </h2>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="rounded border border-[var(--rpg-border)] px-3 py-1 text-xs font-semibold text-[var(--rpg-text-secondary)] transition-colors hover:text-[var(--rpg-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Close
          </button>
        </div>

        <form className="space-y-3 overflow-y-auto pr-1" aria-busy={busy} onSubmit={handleSubmit}>
          <label htmlFor={`${fieldId}-privacy`} className="block text-xs font-semibold text-[var(--rpg-text-secondary)]">
            Privacy
          </label>
          <select
            id={`${fieldId}-privacy`}
            value={privacy}
            disabled={busy}
            onChange={(event) => setPrivacy(event.target.value as SupportTicketPrivacy)}
            className="w-full rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] px-3 py-2 text-sm text-[var(--rpg-text-primary)] disabled:opacity-60"
          >
            {PRIVACY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <label htmlFor={`${fieldId}-area`} className="block text-xs font-semibold text-[var(--rpg-text-secondary)]">
            Area
          </label>
          <select
            id={`${fieldId}-area`}
            value={area}
            disabled={busy}
            onChange={(event) => setArea(event.target.value as SupportTicketArea)}
            className="w-full rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] px-3 py-2 text-sm text-[var(--rpg-text-primary)] disabled:opacity-60"
          >
            {AREA_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <label htmlFor={`${fieldId}-summary`} className="block text-xs font-semibold text-[var(--rpg-text-secondary)]">
            Title
          </label>
          <input
            id={`${fieldId}-summary`}
            value={title}
            disabled={busy}
            maxLength={120}
            aria-describedby={titleNeedsMoreDetail ? `${fieldId}-summary-help` : undefined}
            onChange={(event) => setTitle(event.target.value)}
            className="w-full rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] px-3 py-2 text-sm text-[var(--rpg-text-primary)] disabled:opacity-60"
          />
          {titleNeedsMoreDetail && (
            <p id={`${fieldId}-summary-help`} className="text-xs text-[var(--rpg-text-secondary)]">
              Title needs at least {TITLE_MIN_LENGTH} characters.
            </p>
          )}

          <label htmlFor={`${fieldId}-description`} className="block text-xs font-semibold text-[var(--rpg-text-secondary)]">
            What happened?
          </label>
          <textarea
            id={`${fieldId}-description`}
            value={description}
            disabled={busy}
            maxLength={4000}
            rows={4}
            aria-describedby={descriptionNeedsMoreDetail ? `${fieldId}-description-help` : undefined}
            onChange={(event) => setDescription(event.target.value)}
            className="w-full resize-y rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] px-3 py-2 text-sm text-[var(--rpg-text-primary)] disabled:opacity-60"
          />
          {descriptionNeedsMoreDetail && (
            <p id={`${fieldId}-description-help`} className="text-xs text-[var(--rpg-text-secondary)]">
              Description needs at least {DESCRIPTION_MIN_LENGTH} characters.
            </p>
          )}

          <label htmlFor={`${fieldId}-steps`} className="block text-xs font-semibold text-[var(--rpg-text-secondary)]">
            Steps
          </label>
          <textarea
            id={`${fieldId}-steps`}
            value={reproductionSteps}
            disabled={busy}
            maxLength={3000}
            rows={3}
            onChange={(event) => setReproductionSteps(event.target.value)}
            className="w-full resize-y rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] px-3 py-2 text-sm text-[var(--rpg-text-primary)] disabled:opacity-60"
          />

          {error && (
            <p role="alert" className="text-xs font-semibold text-[var(--rpg-red)]">
              {error}
            </p>
          )}
          {success && (
            <p role="status" className="text-xs font-semibold text-[var(--rpg-green-light)]">
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full rounded bg-[var(--rpg-gold)] px-4 py-2 text-sm font-bold text-[var(--rpg-background)] transition-colors hover:bg-[#e4b85b] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? 'Sending...' : 'Send Report'}
          </button>
        </form>
      </section>
    </ModalOverlay>
  );
}
