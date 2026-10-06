// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';

import cloudflare from '@astrojs/cloudflare';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { INLINE_SCRIPT_FILES, OTHER_DIRECTIVES, SCRIPT_SOURCES, STYLE_SOURCES } from './src/lib/csp.ts';

const sha256 = (/** @type {string} */ file) =>
  /** @type {const} */ (`sha256-${createHash('sha256').update(readFileSync(new URL(file, import.meta.url))).digest('base64')}`);

// I dev mot prod/tt02-CMS (frontend:dev:prod / :tt02) kjører vi SSR på node-adapteren.
// Cloudflare-adapterens workerd-runtime feiler ("Network connection lost") når den henter
// fra det Cloudflare-frontede CMS-et på workers.dev. Node-adapterens fetch fungerer fint.
// Bygg/deploy bruker alltid cloudflare().
const useNodeAdapter = process.env.DEV_USE_NODE === '1';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  integrations: [
    react(),
  ],
  site: 'https://ki.norge.no',
  // Ingen sider rendres fra markdown. Shiki bruker inline-stiler, og Astro advarer om det med CSP på.
  markdown: { syntaxHighlight: false },
  security: {
    csp: {
      directives: [...OTHER_DIRECTIVES],
      scriptDirective: { resources: SCRIPT_SOURCES, hashes: INLINE_SCRIPT_FILES.map(sha256) },
      styleDirective: { resources: STYLE_SOURCES },
    },
  },
  adapter: useNodeAdapter ? node({ mode: 'standalone' }) : cloudflare(),
  devToolbar: { enabled: false },
});