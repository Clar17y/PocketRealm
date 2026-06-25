import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const command = args.length > 0 ? 'npx' : 'npm';
const commandArgs = args.length > 0
  ? ['vitest', 'run', ...args]
  : ['run', 'test', '--workspaces', '--if-present'];

const result = spawnSync(command, commandArgs, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

process.exit(result.status ?? 1);
