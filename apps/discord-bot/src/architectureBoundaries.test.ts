import { readdirSync, readFileSync } from 'fs';
import { relative, resolve, sep } from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(process.cwd(), '../..');
const discordBotSourceRoot = resolve(repoRoot, 'apps/discord-bot/src');

function readRepoFile(repoPath: string): string {
  return readFileSync(resolve(repoRoot, repoPath), 'utf8');
}

function toRepoPath(filePath: string): string {
  return relative(repoRoot, filePath).split(sep).join('/');
}

function isProductionTypeScriptFile(fileName: string): boolean {
  return (
    /\.(ts|tsx)$/.test(fileName) &&
    !/\.d\.ts$/.test(fileName) &&
    !/\.test\.(ts|tsx)$/.test(fileName)
  );
}

function listProductionTypeScriptFiles(directory: string): string[] {
  const productionFiles: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const entryPath = resolve(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'dist') {
        continue;
      }

      productionFiles.push(...listProductionTypeScriptFiles(entryPath));
      continue;
    }

    if (entry.isFile() && isProductionTypeScriptFile(entry.name)) {
      productionFiles.push(toRepoPath(entryPath));
    }
  }

  return productionFiles.sort();
}

describe('discord bot architecture boundaries', () => {
  it('does not import the database package from bot source', () => {
    const packageJson = JSON.parse(readRepoFile('apps/discord-bot/package.json')) as {
      dependencies?: Record<string, string>;
    };

    expect(packageJson.dependencies?.['@pocketrealm/database']).toBeUndefined();
  });

  it('keeps production bot source free of Prisma imports', () => {
    const productionFiles = listProductionTypeScriptFiles(discordBotSourceRoot);

    expect(productionFiles.length).toBeGreaterThan(0);

    for (const file of productionFiles) {
      const source = readRepoFile(file);
      expect(source, file).not.toContain('@pocketrealm/database');
      expect(source, file).not.toContain('prismaTypes');
    }
  });
});
