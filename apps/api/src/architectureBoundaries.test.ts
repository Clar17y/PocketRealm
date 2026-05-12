import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(process.cwd(), '../..');

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('architecture boundaries', () => {
  it('builds packages before seeding a new worktree database', () => {
    const setupScript = readRepoFile('scripts/setup-worktree.ps1');
    const buildPackagesIndex = setupScript.indexOf("npm run build:packages");
    const seedIndex = setupScript.indexOf("npm run db:seed");

    expect(buildPackagesIndex).toBeGreaterThanOrEqual(0);
    expect(seedIndex).toBeGreaterThanOrEqual(0);
    expect(buildPackagesIndex).toBeLessThan(seedIndex);
  });

  it('exposes one local verification script that CI also runs', () => {
    const rootPackage = JSON.parse(readRepoFile('package.json')) as { scripts?: Record<string, string> };
    const ciWorkflow = readRepoFile('.github/workflows/ci.yml');
    const verifyScript = rootPackage.scripts?.['verify:ci'];

    expect(verifyScript).toBeDefined();
    for (const requiredCommand of [
      'npm run typecheck',
      'npm run build:api',
      'npm run build:web',
      'npm run test:engine',
      'npm run test:api',
      'npm run test -w packages/shared',
      'npm run test -w apps/web',
    ]) {
      expect(verifyScript).toContain(requiredCommand);
    }
    expect(rootPackage.scripts?.['db:migrate:deploy']).toBe('npm run migrate:prod -w packages/database');
    expect(ciWorkflow).toContain('npm run db:migrate:deploy');
    expect(ciWorkflow).toContain('npm run verify:ci');
  });

  it('keeps Express app construction importable without startup concerns', () => {
    expect(existsSync(resolve(repoRoot, 'apps/api/src/app.ts'))).toBe(true);

    const indexSource = readRepoFile('apps/api/src/index.ts');
    expect(indexSource).toContain("import { createApp, createCorsOriginChecker } from './app'");
    expect(indexSource).toContain('const app = createApp({ isAllowedCorsOrigin });');
  });

  it('keeps target route workflows behind API services', () => {
    const routeFiles = [
      'apps/api/src/routes/auth.ts',
      'apps/api/src/routes/combat/start.ts',
      'apps/api/src/routes/exploration/start.ts',
      'apps/api/src/routes/zones.ts',
      'apps/api/src/routes/gathering.ts',
      'apps/api/src/routes/crafting/craft.ts',
    ];

    for (const routeFile of routeFiles) {
      const source = readRepoFile(routeFile);
      expect(source, routeFile).not.toMatch(/from ['"]@pocketrealm\/database['"]/);
      expect(source, routeFile).not.toMatch(/\bprisma\./);
      expect(source, routeFile).not.toMatch(/\bprisma\.\$transaction/);
    }
  });

  it('keeps target route files as the Express HTTP boundary', () => {
    const routeFiles = [
      'apps/api/src/routes/auth.ts',
      'apps/api/src/routes/combat/start.ts',
      'apps/api/src/routes/exploration/start.ts',
      'apps/api/src/routes/zones.ts',
      'apps/api/src/routes/gathering.ts',
      'apps/api/src/routes/crafting/craft.ts',
    ];

    for (const routeFile of routeFiles) {
      const source = readRepoFile(routeFile);
      expect(source, routeFile).toContain('Router(');
      expect(source, routeFile).toContain('asyncHandler');
      expect(source, routeFile).toMatch(/from ['"].*Service/);
    }
  });

  it('keeps target API services free of Express response orchestration', () => {
    const serviceFiles = [
      'apps/api/src/services/authRouteService.ts',
      'apps/api/src/services/combat/startRouteService.ts',
      'apps/api/src/services/exploration/startRouteService.ts',
      'apps/api/src/services/zoneRoutesService.ts',
      'apps/api/src/services/gatheringRouteService.ts',
      'apps/api/src/services/crafting/craftRouteService.ts',
    ];

    for (const serviceFile of serviceFiles) {
      const source = readRepoFile(serviceFile);
      expect(source, serviceFile).not.toMatch(/from ['"]express['"]/);
      expect(source, serviceFile).not.toContain('Router(');
      expect(source, serviceFile).not.toMatch(/\breq\./);
      expect(source, serviceFile).not.toMatch(/\bres\./);
    }
  });

  it('documents and instruments runtime scaling assumptions', () => {
    const apiPackage = JSON.parse(readRepoFile('apps/api/package.json')) as { dependencies?: Record<string, string> };
    const socketSource = readRepoFile('apps/api/src/socket/index.ts');
    const timerSource = readRepoFile('apps/api/src/services/roundTimerRegistry.ts');
    const deploymentDocs = readRepoFile('docs/reference/deployment.md');

    expect(apiPackage.dependencies?.['@socket.io/redis-adapter']).toBeDefined();
    expect(socketSource).toContain('@socket.io/redis-adapter');
    expect(socketSource).not.toContain('TODO: Add @socket.io/redis-adapter');
    expect(timerSource).toContain('ROUND_TIMER_WORKER_MODE');
    expect(timerSource).toContain('timerWorkerMode');
    expect(deploymentDocs).toContain('Runtime Topology');
    expect(deploymentDocs).toContain('ROUND_TIMER_WORKER_MODE');
  });
});
