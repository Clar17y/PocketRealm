import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

describe('shared package exports', () => {
  it('offers subpath exports for heavy constants and data modules', () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf8')) as {
      exports?: Record<string, unknown>;
    };

    expect(packageJson.exports?.['.']).toBeDefined();
    expect(packageJson.exports?.['./constants/gameConstants']).toBeDefined();
    expect(packageJson.exports?.['./constants/npcDialogue']).toBeDefined();
    expect(packageJson.exports?.['./constants/achievementDefinitions']).toBeDefined();
    expect(packageJson.exports?.['./constants/expeditionDefinitions']).toBeDefined();
    expect(packageJson.exports?.['./discord/discordXp']).toBeDefined();
  });

  it('keeps heavy data modules out of the root barrel', () => {
    const rootBarrel = readFileSync(resolve(process.cwd(), 'src/index.ts'), 'utf8');

    expect(rootBarrel).not.toContain('./constants/achievementDefinitions');
    expect(rootBarrel).not.toContain('./constants/expeditionDefinitions');
    expect(rootBarrel).not.toContain('./constants/npcDialogue');
  });

  it('does not make game-engine depend on Next.js runtime packages', () => {
    const gameEnginePackage = JSON.parse(
      readFileSync(resolve(process.cwd(), '../game-engine/package.json'), 'utf8'),
    ) as { dependencies?: Record<string, string> };

    expect(gameEnginePackage.dependencies?.next).toBeUndefined();
  });
});
