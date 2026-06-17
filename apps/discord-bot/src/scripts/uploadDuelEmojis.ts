import 'dotenv/config';

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { REST, Routes } from 'discord.js';
import pino from 'pino';

import { loadBotConfig } from '../config.js';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
});

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../../..');
const generatedFile = resolve(scriptDir, '../discord/duelCustomEmoji.ts');

// Bars live at the asset root; the action-icon pack lives in `icons/`.
const DEFAULT_ASSET_DIR = resolve(repoRoot, 'docs/assets/discord-duel-emojis');

interface ApplicationEmoji {
  id: string;
  name: string;
}

function resolveAssetDir(): string {
  const fromArg = process.argv[2];
  const fromEnv = process.env.DUEL_EMOJI_ASSET_DIR;
  return resolve(fromArg ?? fromEnv ?? DEFAULT_ASSET_DIR);
}

/** Collect every `*.png` under the asset root and its `icons/` subdirectory. */
function collectPngs(assetDir: string): Array<{ name: string; path: string }> {
  const dirs = [assetDir, join(assetDir, 'icons')];
  const found: Array<{ name: string; path: string }> = [];
  for (const dir of dirs) {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.toLowerCase().endsWith('.png')) continue;
      found.push({ name: entry.slice(0, -'.png'.length), path: join(dir, entry) });
    }
  }
  return found;
}

function toDataUri(path: string): string {
  return `data:image/png;base64,${readFileSync(path).toString('base64')}`;
}

async function listExistingEmojis(rest: REST, appId: string): Promise<Map<string, string>> {
  // The application-emojis list endpoint wraps results in `{ items: [...] }`.
  const response = (await rest.get(Routes.applicationEmojis(appId))) as { items?: ApplicationEmoji[] };
  const byName = new Map<string, string>();
  for (const emoji of response.items ?? []) {
    byName.set(emoji.name, emoji.id);
  }
  return byName;
}

function writeGeneratedMap(idsByName: Map<string, string>): void {
  const entries = [...idsByName.entries()].sort(([a], [b]) => a.localeCompare(b));
  const body = entries.map(([name, id]) => `  ${name}: '${id}',`).join('\n');
  const content = `/**
 * Maps duel emoji name -> Discord application emoji id.
 *
 * GENERATED / MAINTAINED by \`npm run upload-duel-emojis\` (see
 * src/scripts/uploadDuelEmojis.ts). It is empty until the upload script runs;
 * while empty, the renderer falls back to the Unicode placeholders defined in
 * duelEmoji.ts, so the bot works with or without the custom art uploaded.
 *
 * After running the upload script, commit the populated map so production uses
 * the custom emoji.
 */
export const DUEL_CUSTOM_EMOJI: Record<string, string> = {${entries.length ? `\n${body}\n` : ''}};
`;
  writeFileSync(generatedFile, content);
}

async function main(): Promise<void> {
  const config = loadBotConfig();
  const assetDir = resolveAssetDir();
  const pngs = collectPngs(assetDir);
  if (pngs.length === 0) {
    throw new Error(`No PNG assets found under ${assetDir}. Pass the asset directory as an argument or set DUEL_EMOJI_ASSET_DIR.`);
  }

  const rest = new REST({ version: '10' }).setToken(config.token);
  const existing = await listExistingEmojis(rest, config.clientId);
  const idsByName = new Map<string, string>(existing);

  for (const { name, path } of pngs) {
    const existingId = existing.get(name);
    if (existingId) {
      logger.info({ name, id: existingId }, 'Emoji already uploaded, reusing');
      continue;
    }

    const created = (await rest.post(Routes.applicationEmojis(config.clientId), {
      body: { name, image: toDataUri(path) },
    })) as ApplicationEmoji;
    idsByName.set(created.name, created.id);
    logger.info({ name: created.name, id: created.id }, 'Uploaded emoji');
  }

  writeGeneratedMap(idsByName);
  logger.info(
    { count: idsByName.size, file: generatedFile },
    'Wrote duel custom-emoji map. Review and commit duelCustomEmoji.ts.',
  );
}

void main().catch((error) => {
  logger.error({ error }, 'Failed to upload duel emojis');
  process.exit(1);
});
