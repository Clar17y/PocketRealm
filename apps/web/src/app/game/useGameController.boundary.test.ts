import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const controllerSource = () => readFileSync(resolve(process.cwd(), 'src/app/game/useGameController.ts'), 'utf8');

describe('useGameController domain boundaries', () => {
  it('delegates gathering and crafting actions to domain hooks', () => {
    const source = controllerSource();

    expect(source).toContain("from './hooks/useGatheringActions'");
    expect(source).toContain("from './hooks/useCraftingActions'");
    expect(source).not.toMatch(/\bconst handleMine = async/);
    expect(source).not.toMatch(/\bconst handleCraft = async/);
    expect(source).not.toMatch(/\bmine\(/);
    expect(source).not.toMatch(/\bcraft\(/);
  });

  it('delegates resource and casino actions out of the controller body', () => {
    const source = controllerSource();

    expect(source).toContain("from './hooks/useResourceActions'");
    expect(source).toContain("from './hooks/useCasinoActions'");
    expect(source).not.toMatch(/\bconst handleQuickRest = async/);
    expect(source).not.toMatch(/\bconst handleExchangeGold = useCallback/);
    expect(source).not.toMatch(/\bconst handlePlaceBet = useCallback/);
  });
});
