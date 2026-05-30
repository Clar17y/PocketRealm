import { listSupportTicketsForExport, supportTicketToJsonl } from '../src/services/supportTicketService';
import { SUPPORT_TICKET_STATUSES, type SupportTicketStatus } from '../src/services/supportTicketSchemas';

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match?.slice(prefix.length);
}

function parseStatuses(raw: string | undefined): SupportTicketStatus[] | undefined {
  if (!raw) return undefined;

  const allowed = new Set<string>(SUPPORT_TICKET_STATUSES);
  const statuses = raw.split(',').map((value) => value.trim()).filter(Boolean);
  const unsupported = statuses.filter((value) => !allowed.has(value));

  if (unsupported.length > 0) {
    throw new Error(`Unsupported --status value: ${unsupported.join(', ')}`);
  }

  return statuses.filter((value): value is SupportTicketStatus => allowed.has(value));
}

function parseLimit(raw: string | undefined): number | undefined {
  if (!raw) return undefined;

  if (!/^\d+$/.test(raw)) {
    throw new Error('Expected --limit to be a positive integer');
  }

  const limit = Number.parseInt(raw, 10);
  if (!Number.isInteger(limit) || limit < 1) {
    throw new Error('Expected --limit to be a positive integer');
  }

  return limit;
}

function parseCreatedAfter(raw: string | undefined): Date | undefined {
  if (!raw) return undefined;

  const createdAfter = new Date(raw);
  if (Number.isNaN(createdAfter.getTime())) {
    throw new Error('Expected --createdAfter to be a valid ISO date');
  }

  return createdAfter;
}

async function main(): Promise<void> {
  const format = argValue('format') ?? 'jsonl';
  if (format !== 'jsonl') {
    throw new Error('Only --format=jsonl is supported');
  }

  const tickets = await listSupportTicketsForExport({
    statuses: parseStatuses(argValue('status')),
    limit: parseLimit(argValue('limit')),
    createdAfter: parseCreatedAfter(argValue('createdAfter')),
  });

  for (const ticket of tickets) {
    process.stdout.write(supportTicketToJsonl(ticket));
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
