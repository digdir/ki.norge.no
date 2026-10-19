# Favicon

`favicon.svg` is the source. The PNG variants are rasterised from it and must
be regenerated if the logo changes:

```bash
node -e "
const sharp = require('sharp');
const src = 'apps/frontend/public/favicon/favicon.svg';
const out = 'apps/frontend/public/favicon/';
for (const [name, size] of [
  ['favicon-16x16.png', 16],
  ['favicon-32x32.png', 32],
  ['apple-touch-icon-180x180.png', 180],
  ['android-chrome-192x192.png', 192],
  ['android-chrome-512x512.png', 512],
]) sharp(src, { density: 600 }).resize(size, size).png({ compressionLevel: 9 }).toFile(out + name);
"
```

`favicon.ico` stays in the root of `public/`. Browsers, RSS readers and
link previews request `/favicon.ico` directly when they do not find a
`<link>`, so that path must respond.

The references are in `src/components/layout/Layout.astro` and
`public/manifest.webmanifest`. The folder is let through the gating check via
`PUBLIC_ASSET_PREFIXES` in `src/middleware.ts`.

The emblem is a detailed heraldic lion and becomes illegible below 32 px. Drawing a
simplified variant for the smallest sizes is a design task, not done here.
