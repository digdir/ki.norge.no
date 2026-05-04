import {defineConfig} from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import sitemap from '@astrojs/sitemap';
import {createRequire} from 'node:module';
import path from 'node:path';

// Workaround: Vite 7 does not serve /@vite/client in Astro 6 dev mode,
// which blocks React hydration. This plugin fixes it.
function viteClientFix() {
  let clientEntry;
  return {
    name: 'vite-client-fix',
    configResolved() {
      const require = createRequire(import.meta.url);
      clientEntry = path.resolve(
        path.dirname(require.resolve('vite/package.json')),
        'dist/client/client.mjs',
      );
    },
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url === '/@vite/client') {
          req.url = `/@fs/${clientEntry}`;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  output: 'server',
  site: 'https://ki.norge.no',
  adapter: cloudflare({
    routes: {
      extend: {
        exclude: [
          {pattern: '/@*'},
          {pattern: '/@vite/*'},
          {pattern: '/@id/*'},
          {pattern: '/@fs/*'},
          {pattern: '/@react-refresh'},
          {pattern: '/node_modules/*'},
          {pattern: '/src/*'},
          {pattern: '/favicon.ico'},
          {pattern: '/_astro/*'},
        ],
      },
    },
  }),
  integrations: [
    react({experimentalReactChildren: true}),
    sitemap({
      filter: (page) =>
        !page.includes('/status') &&
        !page.includes('/admin-tilgang') &&
        !page.includes('/preview-tilgang') &&
        !page.includes('/ki-ordboka') &&
        !page.includes('/ki-ordboken'),
    }),
  ],
  vite: {
    plugins: [viteClientFix()],
    build: {
      minify: 'esbuild',
      cssMinify: 'esbuild',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              return 'vendor';
            }
          },
        },
      },
    },
  },
});
