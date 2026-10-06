#!/usr/bin/env node
// Starter mock-CMS + Astro dev-server mot den, i en kommando.
// Ctrl-C eller `astro dev stop` stopper begge. Kjøres fra repo-rot via
// "pnpm run frontend:dev:mock", og flagg som --port går videre til astro dev.
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

// Astro 7 legger dev-serveren i bakgrunnen når en agent kjører den, og da
// avslutter prosessen med en gang. Variabelen er den Astro selv setter på
// bakgrunnsprosessen, og holder serveren i forgrunnen. Lockfila skrives
// fortsatt, så `astro dev stop` virker. Astro startes uten pnpm imellom, så
// kill() treffer selve serveren.
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
// Astro avslutter med 143 når `astro dev stop` sender SIGTERM, og det er en vanlig stopp.
frontend.on('exit', (code) => stop(code === 143 ? 0 : (code ?? 0)));
mock.on('exit', () => stop(1));
