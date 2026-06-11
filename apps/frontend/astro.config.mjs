// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';

import cloudflare from '@astrojs/cloudflare';

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
  adapter: useNodeAdapter ? node({ mode: 'standalone' }) : cloudflare(),
});