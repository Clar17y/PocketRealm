import { useEffect, useState } from 'react';
import {
  SUPPORT_SENSITIVITY_FLAGS,
  SUPPORT_TICKET_STATUSES,
} from '@pocketrealm/shared/support/supportTickets';
import { PixelButton } from '@/components/PixelButton';
import { PixelCard } from '@/components/PixelCard';
import {
  adminListSupportTickets,
  adminUpdateSupportTicket,
  type AdminSupportSensitivityFlag,
  type AdminSupportTicket,
  type AdminSupportTicketStatus,
  type AdminSupportTicketUpdateInput,
} from '@/lib/api';
import { StatusMsg } from './StatusMsg';
import { useAdminAction } from './useAdminAction';

const DEFAULT_STATUS_FILTER = 'new,needs_info';

const STATUS_OPTIONS = SUPPORT_TICKET_STATUSES;

const SENSITIVITY_FLAGS = SUPPORT_SENSITIVITY_FLAGS;

interface TicketDraft {
  status: AdminSupportTicketStatus;
  note: string;
  duplicateTicketIds: string;
  githubIssueUrl: string;
  sensitivityFlags: string;
}

interface CodexDecision {
  id: string;
  status?: AdminSupportTicketStatus;
  note?: string;
  duplicateTicketIds?: string[];
  githubIssueUrl?: string | null;
  sensitivityFlags?: AdminSupportSensitivityFlag[];
}

function splitList(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function draftFor(ticket: AdminSupportTicket, existing?: TicketDraft): TicketDraft {
  return existing ?? {
    status: ticket.status,
    note: '',
    duplicateTicketIds: ticket.duplicateTicketIds.join(', '),
    githubIssueUrl: ticket.githubIssueUrl ?? '',
    sensitivityFlags: ticket.sensitivityFlags.join(', '),
  };
}

function buildUpdateInput(draft: TicketDraft): AdminSupportTicketUpdateInput {
  const duplicateTicketIds = splitList(draft.duplicateTicketIds);
  const sensitivityFlags = parseSensitivityFlags(draft.sensitivityFlags);
  const githubIssueUrl = draft.githubIssueUrl.trim();
  return {
    status: draft.status,
    ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
    duplicateTicketIds,
    githubIssueUrl: githubIssueUrl || null,
    sensitivityFlags,
  };
}

function isStatus(value: unknown): value is AdminSupportTicketStatus {
  return typeof value === 'string' && STATUS_OPTIONS.includes(value as AdminSupportTicketStatus);
}

function isSensitivityFlag(value: unknown): value is AdminSupportSensitivityFlag {
  return typeof value === 'string' && SENSITIVITY_FLAGS.includes(value as AdminSupportSensitivityFlag);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'string');
}

function parseSensitivityFlags(value: string): AdminSupportSensitivityFlag[] {
  const flags = splitList(value);
  const sensitivityFlags = flags.filter(isSensitivityFlag);
  const invalid = flags.filter((flag) => !isSensitivityFlag(flag));
  if (invalid.length > 0) throw new Error(`Unsupported sensitivity flag: ${invalid.join(', ')}`);
  return sensitivityFlags;
}

function parseDecision(value: unknown, index: number): CodexDecision {
  if (!value || typeof value !== 'object') throw new Error(`Decision ${index} must be an object`);
  const record = value as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : typeof record.publicId === 'string' ? record.publicId : '';
  if (!id) throw new Error(`Decision ${index} is missing id`);

  const decision: CodexDecision = { id };
  if (record.status !== undefined) {
    if (!isStatus(record.status)) throw new Error(`Decision ${index} has invalid status`);
    decision.status = record.status;
  }
  if (typeof record.note === 'string') decision.note = record.note;
  if (isStringArray(record.duplicateTicketIds)) decision.duplicateTicketIds = record.duplicateTicketIds;
  if (typeof record.githubIssueUrl === 'string' || record.githubIssueUrl === null) {
    decision.githubIssueUrl = record.githubIssueUrl;
  }
  if (record.sensitivityFlags !== undefined) {
    if (!Array.isArray(record.sensitivityFlags) || !record.sensitivityFlags.every(isSensitivityFlag)) {
      throw new Error(`Decision ${index} has invalid sensitivityFlags`);
    }
    decision.sensitivityFlags = record.sensitivityFlags;
  }
  return decision;
}

export function parseCodexSupportDecisions(raw: string): CodexDecision[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith('[')) {
    const parsed = JSON.parse(trimmed) as unknown;
    if (!Array.isArray(parsed)) throw new Error('Codex decisions JSON must be an array');
    return parsed.map((entry, index) => parseDecision(entry, index + 1));
  }

  return trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => parseDecision(JSON.parse(line) as unknown, index + 1));
}

function decisionToUpdateInput(decision: CodexDecision): AdminSupportTicketUpdateInput {
  return {
    ...(decision.status ? { status: decision.status } : {}),
    ...(decision.note ? { note: decision.note } : {}),
    ...(decision.duplicateTicketIds ? { duplicateTicketIds: decision.duplicateTicketIds } : {}),
    ...(decision.githubIssueUrl !== undefined ? { githubIssueUrl: decision.githubIssueUrl } : {}),
    ...(decision.sensitivityFlags ? { sensitivityFlags: decision.sensitivityFlags } : {}),
  };
}

export function SupportTab() {
  const [tickets, setTickets] = useState<AdminSupportTicket[]>([]);
  const [drafts, setDrafts] = useState<Record<string, TicketDraft>>({});
  const [statusFilter, setStatusFilter] = useState(DEFAULT_STATUS_FILTER);
  const [decisionInput, setDecisionInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const { busy, msg, setMsg, act } = useAdminAction();

  const loadTickets = async () => {
    setLoading(true);
    try {
      const res = await adminListSupportTickets({ status: statusFilter, limit: 50 });
      if (res.error) {
        setMsg({ text: `Load support tickets failed: ${res.error.message}`, ok: false });
        return;
      }
      setTickets(res.data?.tickets ?? []);
      // Drop local drafts so fresh server data wins after any reload, and a
      // re-applied draft can never resubmit a stale staff note.
      setDrafts({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTickets();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshAfter = async <T,>(promise: Promise<T | null>) => {
    const result = await promise;
    if (result) await loadTickets();
    return result;
  };

  const setDraft = (ticket: AdminSupportTicket, update: Partial<TicketDraft>) => {
    setDrafts((current) => ({
      ...current,
      [ticket.id]: {
        ...draftFor(ticket, current[ticket.id]),
        ...update,
      },
    }));
  };

  const applyCodexDecisions = async () => {
    if (bulkBusy || busy) return;

    let decisions: CodexDecision[];
    try {
      decisions = parseCodexSupportDecisions(decisionInput);
    } catch (error) {
      setMsg({ text: error instanceof Error ? error.message : 'Invalid Codex decisions', ok: false });
      return;
    }

    if (decisions.length === 0) {
      setMsg({ text: 'Paste at least one Codex decision first', ok: false });
      return;
    }

    setBulkBusy(true);
    setMsg(null);
    try {
      for (const decision of decisions) {
        const res = await adminUpdateSupportTicket(decision.id, decisionToUpdateInput(decision));
        if (res.error) {
          setMsg({ text: `Apply ${decision.id} failed: ${res.error.message}`, ok: false });
          return;
        }
      }
      setDecisionInput('');
      setMsg({ text: `Applied ${decisions.length} Codex decision${decisions.length === 1 ? '' : 's'}`, ok: true });
      await loadTickets();
    } finally {
      setBulkBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PixelCard>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--rpg-gold)]">Support Triage</h3>
            <p className="mt-1 text-xs text-[var(--rpg-text-secondary)]">
              Review in-game reports, update statuses, and apply Codex triage decisions.
            </p>
          </div>
          <label className="text-sm text-[var(--rpg-text-primary)]">
            <span className="mb-1 block text-xs text-[var(--rpg-text-secondary)]">Statuses</span>
            <input
              aria-label="Support status filter"
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="w-48 rounded border border-[var(--rpg-border)] bg-[var(--rpg-surface)] px-2 py-1 text-sm text-[var(--rpg-text-primary)]"
            />
          </label>
          <PixelButton size="sm" disabled={loading} onClick={() => void loadTickets()}>
            Refresh
          </PixelButton>
        </div>
      </PixelCard>

      <PixelCard>
        <h3 className="mb-3 text-sm font-semibold text-[var(--rpg-gold)]">Codex Decisions</h3>
        <div className="mb-3 rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] p-3 text-xs text-[var(--rpg-text-secondary)]">
          <div className="font-semibold text-[var(--rpg-text-primary)]">Run support export</div>
          <code className="mt-2 block overflow-x-auto whitespace-pre rounded bg-[var(--rpg-surface)] px-2 py-1 font-mono text-[var(--rpg-gold)]">
            npm --silent run support:export-new -w apps/api -- --limit=20
          </code>
          <ol className="mt-2 list-decimal space-y-1 pl-4">
            <li>Send the exported JSONL to Codex and ask it to triage against the current GitHub backlog.</li>
            <li>For accepted bugs, create or update the GitHub issue before applying the decision.</li>
            <li>Paste Codex decision JSONL here, then apply it to update tickets.</li>
          </ol>
        </div>
        <label className="text-sm text-[var(--rpg-text-primary)]">
          <span className="mb-1 block text-xs text-[var(--rpg-text-secondary)]">Codex decisions JSONL</span>
          <textarea
            aria-label="Codex decisions JSONL"
            value={decisionInput}
            rows={5}
            onChange={(event) => setDecisionInput(event.target.value)}
            className="w-full resize-y rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] px-2 py-1 font-mono text-xs text-[var(--rpg-text-primary)]"
          />
        </label>
        <PixelButton
          size="sm"
          className="mt-3"
          disabled={busy || bulkBusy || !decisionInput.trim()}
          onClick={() => void applyCodexDecisions()}
        >
          Apply Codex Decisions
        </PixelButton>
      </PixelCard>

      <PixelCard>
        <h3 className="mb-3 text-sm font-semibold text-[var(--rpg-gold)]">Tickets</h3>
        {loading && <div className="text-sm text-[var(--rpg-text-secondary)]">Loading...</div>}
        {!loading && tickets.length === 0 && (
          <div className="text-sm text-[var(--rpg-text-secondary)]">No support tickets found.</div>
        )}
        <div className="space-y-3">
          {tickets.map((ticket) => {
            const draft = draftFor(ticket, drafts[ticket.id]);
            return (
              <div
                key={ticket.id}
                data-testid={`support-ticket-${ticket.id}`}
                className="rounded border border-[var(--rpg-border)] bg-[var(--rpg-surface)] px-3 py-2"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <strong className="text-[var(--rpg-gold)]">{ticket.id}</strong>
                      <span className="rounded bg-[var(--rpg-background)] px-2 py-0.5 text-xs text-[var(--rpg-text-secondary)]">
                        {ticket.status}
                      </span>
                      <span className="text-xs text-[var(--rpg-text-secondary)]">
                        {ticket.privacy} / {ticket.area}
                      </span>
                    </div>
                    <div className="mt-1 font-almendra text-lg text-[var(--rpg-text-primary)]">{ticket.title}</div>
                    <pre className="mt-2 whitespace-pre-wrap rounded bg-[var(--rpg-background)] p-2 text-xs text-[var(--rpg-text-primary)]">
                      {ticket.body}
                    </pre>
                    {ticket.staffNotes?.trim() ? (
                      <div className="mt-2 rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] p-2">
                        <div className="text-xs font-semibold text-[var(--rpg-gold)]">Saved staff notes</div>
                        <div className="mt-1 whitespace-pre-wrap text-xs text-[var(--rpg-text-primary)]">
                          {ticket.staffNotes}
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-2 text-xs text-[var(--rpg-text-secondary)]">
                      {ticket.reporter.displayName} / {ticket.reporter.realm}
                      {ticket.reporter.seasonId ? ` (${ticket.reporter.seasonId})` : ''}
                      {ticket.context.screen ? ` / ${ticket.context.screen}` : ''}
                      {' / '}
                      {new Date(ticket.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="grid w-full gap-2 md:w-80">
                    <label className="text-xs text-[var(--rpg-text-secondary)]">
                      Status
                      <select
                        aria-label="Status"
                        value={draft.status}
                        onChange={(event) => setDraft(ticket, { status: event.target.value as AdminSupportTicketStatus })}
                        className="mt-1 w-full rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] px-2 py-1 text-sm text-[var(--rpg-text-primary)]"
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-xs text-[var(--rpg-text-secondary)]">
                      Duplicate ticket IDs
                      <input
                        aria-label="Duplicate ticket IDs"
                        value={draft.duplicateTicketIds}
                        onChange={(event) => setDraft(ticket, { duplicateTicketIds: event.target.value })}
                        className="mt-1 w-full rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] px-2 py-1 text-sm text-[var(--rpg-text-primary)]"
                      />
                    </label>
                    <label className="text-xs text-[var(--rpg-text-secondary)]">
                      GitHub issue URL
                      <input
                        aria-label="GitHub issue URL"
                        value={draft.githubIssueUrl}
                        onChange={(event) => setDraft(ticket, { githubIssueUrl: event.target.value })}
                        className="mt-1 w-full rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] px-2 py-1 text-sm text-[var(--rpg-text-primary)]"
                      />
                    </label>
                    <label className="text-xs text-[var(--rpg-text-secondary)]">
                      Sensitivity flags
                      <input
                        aria-label="Sensitivity flags"
                        list="support-sensitivity-flags"
                        value={draft.sensitivityFlags}
                        onChange={(event) => setDraft(ticket, { sensitivityFlags: event.target.value })}
                        className="mt-1 w-full rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] px-2 py-1 text-sm text-[var(--rpg-text-primary)]"
                      />
                    </label>
                    <label className="text-xs text-[var(--rpg-text-secondary)]">
                      Staff note
                      <textarea
                        aria-label="Staff note"
                        value={draft.note}
                        rows={3}
                        onChange={(event) => setDraft(ticket, { note: event.target.value })}
                        className="mt-1 w-full resize-y rounded border border-[var(--rpg-border)] bg-[var(--rpg-background)] px-2 py-1 text-sm text-[var(--rpg-text-primary)]"
                      />
                    </label>
                    <PixelButton
                      size="sm"
                      disabled={busy || bulkBusy}
                      onClick={() => {
                        let input: AdminSupportTicketUpdateInput;
                        try {
                          input = buildUpdateInput(draft);
                        } catch (error) {
                          setMsg({
                            text: error instanceof Error ? error.message : 'Invalid support ticket update',
                            ok: false,
                          });
                          return;
                        }

                        void refreshAfter(act(
                          `Update ${ticket.id}`,
                          () => adminUpdateSupportTicket(ticket.id, input),
                        ));
                      }}
                    >
                      Apply
                    </PixelButton>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </PixelCard>

      <datalist id="support-sensitivity-flags">
        {SENSITIVITY_FLAGS.map((flag) => (
          <option key={flag} value={flag} />
        ))}
      </datalist>

      <StatusMsg msg={msg} />
    </div>
  );
}
