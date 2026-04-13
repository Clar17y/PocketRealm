import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Read root package.json directly so the expected value stays in lockstep
// with whatever version.ts resolves at runtime.
const rootPkgJson = JSON.parse(
  readFileSync(resolve(__dirname, '..', '..', '..', 'package.json'), 'utf8'),
) as { version: string };

describe('APP_VERSION', () => {
  const original = process.env.APP_VERSION;

  beforeEach(() => {
    delete process.env.APP_VERSION;
    vi.resetModules();
  });

  afterEach(() => {
    if (original === undefined) {
      delete process.env.APP_VERSION;
    } else {
      process.env.APP_VERSION = original;
    }
    vi.resetModules();
  });

  it('reads version from root package.json when APP_VERSION env is unset', async () => {
    const mod = await import('./version.js');
    expect(mod.APP_VERSION).toBe(rootPkgJson.version);
  });

  it('uses APP_VERSION from the environment', async () => {
    process.env.APP_VERSION = '1.2.3';
    const mod = await import('./version.js');
    expect(mod.APP_VERSION).toBe('1.2.3');
  });
});
