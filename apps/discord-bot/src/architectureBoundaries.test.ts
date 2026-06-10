import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(process.cwd(), '../..');

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('discord bot architecture boundaries', () => {
  it('does not import the database package from bot source', () => {
    const packageJson = JSON.parse(readRepoFile('apps/discord-bot/package.json')) as {
      dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies?.['@pocketrealm/database']).toBeUndefined();
  });

  it('keeps production bot source free of Prisma imports', () => {
    const productionFiles = [
      'apps/discord-bot/src/index.ts',
      'apps/discord-bot/src/xp/messageXp.ts',
      'apps/discord-bot/src/interactions/staffCommands.ts',
    ];

    for (const file of productionFiles) {
      const source = readRepoFile(file);
      expect(source, file).not.toContain('@pocketrealm/database');
      expect(source, file).not.toContain('prismaTypes');
    }
  });
});
