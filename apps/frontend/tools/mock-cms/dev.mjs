#!/usr/bin/env node
// Starter mock-CMS + Astro dev-server mot den, i en kommando.
// Ctrl-C stopper begge. Kjores fra repo-rot via "npm run frontend:dev:mock".
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const port = process.env.MOCK_PORT || '5050';

const mock = spawn('node', [join(here, 'server.mjs')], {
  stdio: 'inherit',
  env: { ...process.env, MOCK_PORT: port },
});

const frontend = spawn('pnpm', ['--dir', 'apps/frontend', 'run', 'dev'], {
  stdio: 'inherit',
  env: {
    ...process.env,
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
frontend.on('exit', (code) => stop(code ?? 0));
mock.on('exit', () => stop(1));
