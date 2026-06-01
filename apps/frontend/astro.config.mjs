// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import node from '@astrojs/node';

import sitemap from '@astrojs/sitemap';

import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  output: 'server',
  integrations: [
    react(),
    sitemap({
      // Exclude admin/redirect pages from sitemap so search engines don't index them
      filter: (page) =>
        !page.includes('/status') &&
        !page.includes('/admin-tilgang') &&
        !page.includes('/preview-tilgang') &&
        !page.includes('/ki-ordboka') &&
        !page.includes('/ki-ordboken'),
    }),
  ],
  site: 'https://ki.norge.no',
  adapter: cloudflare(),
});