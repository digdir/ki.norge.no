#!/usr/bin/env node
// Starts the mock CMS + the Astro dev server against it, in one command.
// Ctrl-C or `astro dev stop` stops both. Run from the repo root via
// "pnpm run frontend:dev:mock", and flags like --port are passed on to astro dev.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const frontendDir = join(here, '..', '..');
const astroBin = join(dirname(createRequire(join(frontendDir, 'package.json')).resolve('astro/package.json')), 'bin', 'astro.mjs');
const port = process.env.MOCK_PORT || '5050';

const mock = spawn('node', [join(here, 'server.mjs')], {
  stdio: 'inherit',
  env: { ...process.env, MOCK_PORT: port },
});

// Astro 7 puts the dev server in the background when an agent runs it, and then
// the process exits right away. The variable is the one Astro itself sets on
// the background process, and keeps the server in the foreground. The lock file is still
// written, so `astro dev stop` works. Astro is started without pnpm in between, so
// kill() hits the server itself.
const frontend = spawn(process.execPath, [astroBin, 'dev', ...process.argv.slice(2)], {
  cwd: frontendDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    ASTRO_DEV_BACKGROUND: '1',
    UMBRACO_URL: `http://localhost:${port}`,
    UMBRACO_PUBLIC_URL: `http://localhost:${port}`,
  },
});

let stopping = false;
const stop = (code = 0) => {
  if (stopping) return;
  stopping = true;
  mock.kill();
  frontend.kill();
  process.exit(code);
};

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
// Astro exits with 143 when `astro dev stop` sends SIGTERM, and that is a normal stop.
frontend.on('exit', (code) => stop(code === 143 ? 0 : (code ?? 0)));
mock.on('exit', () => stop(1));
