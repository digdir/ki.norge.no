// Går gjennom hver URL i sitemapet og ser etter layoutfeil som ikke fanges av
// enhetstester, på mobil og desktop.
//
// Sjekker:
//   - innhold som ligger oppå den transparente headeren
//   - urendrede elementer først i main (fjerner kompensasjonen for main sin
//     negative toppmargin, se #689)
//   - vannrett rulling, altså noe som er bredere enn vinduet
//   - bilder som mangler src eller ikke laster
//
// Bruk:
//   pnpm run audit:layout                        mot prod
//   pnpm run audit:layout http://localhost:4321  mot en lokal server
//
// Avslutter med kode 1 hvis noe blir funnet, så den kan brukes som port.
// Krever at Playwright-nettleserne er installert (pnpm --dir apps/frontend exec playwright install chromium).

import { createRequire } from 'node:module';

// @playwright/test er direkteavhengigheten i apps/frontend og re-eksporterer
// chromium. `playwright` er bare transitiv og ligger ikke i node_modules-roten.
const require = createRequire(new URL('../apps/frontend/', import.meta.url));
const { chromium } = require('@playwright/test');

const BASE = (process.argv[2] || 'https://ki.norge.no').replace(/\/$/, '');

const VIEWPORTS = [
  { name: 'mobil', width: 390, height: 844, scale: 2 },
  { name: 'desktop', width: 1440, height: 900, scale: 1 },
];

async function hentUrler() {
  const res = await fetch(`${BASE}/sitemap.xml`);
  if (!res.ok) throw new Error(`sitemap.xml svarte ${res.status}`);
  const xml = await res.text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  // Sitemapet peker på prod-domenet. Kjører vi mot noe annet, bytt origin.
  return locs.map((u) => BASE + new URL(u).pathname);
}

// Kjøres i nettleseren.
const probe = () => {
  const doc = document.documentElement;
  const out = { hidden: [], collisions: [], badImages: [], overflow: null };

  out.overflow =
    doc.scrollWidth > doc.clientWidth
      ? { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth }
      : null;

  // Skjult for seende, men til stede i DOM. Skal ikke regnes som kollisjon.
  const erUsynlig = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return true;
    // sr-only-mønsteret: 1px boks klippet bort.
    if (cs.clip === 'rect(0px, 0px, 0px, 0px)') return true;
    if (cs.clipPath === 'inset(50%)') return true;
    const r = el.getBoundingClientRect();
    return r.width <= 1 || r.height <= 1;
  };

  const header = document.querySelector('header');
  const main = document.querySelector('main');

  // Bare elementer som ALDRI rendres. En visuelt skjult h1 (ds-sr-only) står
  // der med vilje for skjermlesere og skal ikke rapporteres.
  const ALDRI_RENDRET = new Set(['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT', 'LINK', 'META']);
  if (main) {
    for (const el of main.children) {
      if (!ALDRI_RENDRET.has(el.tagName)) break;
      const type = el.getAttribute?.('type');
      out.hidden.push(el.tagName.toLowerCase() + (type ? `[${type}]` : ''));
    }
  }

  if (header && main) {
    const hr = header.getBoundingClientRect();
    out.collisions = [...main.querySelectorAll('h1, h2, p, img')]
      .filter((el) => {
        if (erUsynlig(el)) return false;
        const r = el.getBoundingClientRect();
        return r.top < hr.bottom && r.bottom > hr.top && r.left < hr.right && r.right > hr.left;
      })
      .slice(0, 4)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        tekst: (el.textContent || '').trim().slice(0, 40),
      }));
  }

  out.badImages = [...document.querySelectorAll('img')]
    .filter((img) => {
      const src = img.getAttribute('src');
      return !src || (img.complete && img.naturalWidth === 0);
    })
    .slice(0, 5)
    .map((img) => img.getAttribute('src') || '(mangler src)');

  return out;
};

const urls = await hentUrler();
console.log(`${urls.length} sider fra ${BASE}/sitemap.xml, ${VIEWPORTS.length} visninger\n`);

const browser = await chromium.launch();
const funn = [];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.scale,
  });
  const page = await ctx.newPage();

  for (const url of urls) {
    try {
      const res = await page.goto(url, { waitUntil: 'load', timeout: 45000 });
      await page.waitForTimeout(400);
      const r = await page.evaluate(probe);

      const problemer = [];
      if (res && res.status() >= 400) problemer.push(`HTTP ${res.status()}`);
      if (r.collisions.length)
        problemer.push(
          `ligger oppå headeren: ${r.collisions.map((c) => `${c.tag} "${c.tekst}"`).join('; ')}`,
        );
      if (r.hidden.length)
        problemer.push(`urendret element først i main: ${r.hidden.join(', ')}`);
      if (r.overflow)
        problemer.push(
          `vannrett rulling: ${r.overflow.scrollWidth}px innhold i ${r.overflow.clientWidth}px vindu`,
        );
      if (r.badImages.length) problemer.push(`bilder laster ikke: ${r.badImages.join(', ')}`);

      if (problemer.length) funn.push({ url, viewport: vp.name, problemer });
    } catch (err) {
      funn.push({ url, viewport: vp.name, problemer: [`feilet: ${err.message.slice(0, 90)}`] });
    }
  }
  await ctx.close();
}
await browser.close();

if (!funn.length) {
  console.log('Ingen funn.');
  process.exit(0);
}

for (const f of funn) {
  console.log(`[${f.viewport}] ${f.url.replace(BASE, '') || '/'}`);
  for (const p of f.problemer) console.log(`   - ${p}`);
}
console.log(`\n${funn.length} funn.`);
process.exit(1);
