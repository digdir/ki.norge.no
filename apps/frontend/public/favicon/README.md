# Favicon

`favicon.svg` er kilden. PNG-variantene er rasterisert fra den og skal
regenereres hvis logoen endres:

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

`favicon.ico` blir liggende i roten av `public/`. Nettlesere, RSS-lesere og
lenkeforhåndsvisninger ber om `/favicon.ico` direkte når de ikke finner en
`<link>`, så den stien må svare.

Referansene står i `src/components/layout/Layout.astro` og
`public/manifest.webmanifest`. Mappa er sluppet gjennom gating-sjekken via
`PUBLIC_ASSET_PREFIXES` i `src/middleware.ts`.

Merket er en detaljert heraldisk løve og blir uleselig under 32 px. Å tegne en
forenklet variant for de minste størrelsene er en designoppgave, ikke gjort her.
