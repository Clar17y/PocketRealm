import { logger } from '../logger';
import { redactSupportText } from './supportTicketRedaction';

interface TicketNotification {
  publicId: string;
  title: string;
  privacy: string;
  category: string;
  area: string;
  reporterDisplayName: string;
  realmLabel: string;
  screen: string | null;
}

function webhookUrl(): string | null {
  const value = process.env.DISCORD_SUPPORT_TRIAGE_WEBHOOK_URL?.trim();
  return value && value.length > 0 ? value : null;
}

export async function notifySupportTicketCreated(ticket: TicketNotification): Promise<void> {
  const url = webhookUrl();
  if (!url) return;

  const payload = {
    username: 'PocketRealm Support',
    embeds: [
      {
        title: `${ticket.publicId}: ${redactSupportText(ticket.title) ?? ticket.publicId}`,
        description: 'New support ticket created in PocketRealm.',
        color: 0xd4a84b,
        fields: [
          { name: 'Privacy', value: ticket.privacy, inline: true },
          { name: 'Category', value: ticket.category, inline: true },
          { name: 'Area', value: ticket.area, inline: true },
          { name: 'Reporter', value: ticket.reporterDisplayName, inline: true },
          { name: 'Realm', value: ticket.realmLabel, inline: true },
          { name: 'Screen', value: ticket.screen ?? 'unknown', inline: true },
        ],
        timestamp: new Date().toISOString(),
      },
    ],
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.warn({ status: res.status, body }, 'Discord support triage webhook failed');
    }
  } catch (err) {
    logger.warn({ err }, 'Discord support triage webhook failed');
  }
}
