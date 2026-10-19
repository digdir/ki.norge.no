// Goes through every URL in the sitemap and looks for layout errors that unit tests
// do not catch, on mobile and desktop.
//
// Checks:
//   - content that sits on top of the transparent header
//   - unrendered elements first in main (removes the compensation for main's
//     negative top margin, see #689)
//   - horizontal scrolling, meaning something wider than the viewport
//   - images that lack src or do not load
//
// Usage:
//   pnpm run audit:layout                        against prod
//   pnpm run audit:layout http://localhost:4321  against a local server
//
// Exits with code 1 if anything is found, so it can be used as a gate.
// Requires the Playwright browsers to be installed (pnpm --dir apps/frontend exec playwright install chromium).

import { createRequire } from 'node:module';

// @playwright/test is the direct dependency in apps/frontend and re-exports
// chromium. `playwright` is only transitive and is not in the node_modules root.
const require = createRequire(new URL('../apps/frontend/', import.meta.url));
const { chromium } = require('@playwright/test');

const BASE = (process.argv[2] || 'https://ki.norge.no').replace(/\/$/, '');

const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844, scale: 2 },
  { name: 'desktop', width: 1440, height: 900, scale: 1 },
];

async function hentUrler() {
  const res = await fetch(`${BASE}/sitemap.xml`);
  if (!res.ok) throw new Error(`sitemap.xml answered ${res.status}`);
  const xml = await res.text();
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  // The sitemap points to the prod domain. If we run against something else, swap the origin.
  return locs.map((u) => BASE + new URL(u).pathname);
}

// Runs in the browser.
const probe = () => {
  const doc = document.documentElement;
  const out = { hidden: [], collisions: [], badImages: [], overflow: null };

  out.overflow =
    doc.scrollWidth > doc.clientWidth
      ? { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth }
      : null;

  // Hidden for sighted users, but present in the DOM. Must not count as a collision.
  const erUsynlig = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') return true;
    // The sr-only pattern: a 1px box clipped away.
    if (cs.clip === 'rect(0px, 0px, 0px, 0px)') return true;
    if (cs.clipPath === 'inset(50%)') return true;
    const r = el.getBoundingClientRect();
    return r.width <= 1 || r.height <= 1;
  };

  const header = document.querySelector('header');
  const main = document.querySelector('main');

  // Only elements that are NEVER rendered. A visually hidden h1 (ds-sr-only) is
  // there on purpose for screen readers and must not be reported.
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
    .map((img) => img.getAttribute('src') || '(missing src)');

  return out;
};

const urls = await hentUrler();
console.log(`${urls.length} pages from ${BASE}/sitemap.xml, ${VIEWPORTS.length} viewports\n`);

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
          `on top of the header: ${r.collisions.map((c) => `${c.tag} "${c.tekst}"`).join('; ')}`,
        );
      if (r.hidden.length)
        problemer.push(`unrendered element first in main: ${r.hidden.join(', ')}`);
      if (r.overflow)
        problemer.push(
          `horizontal scrolling: ${r.overflow.scrollWidth}px content in ${r.overflow.clientWidth}px viewport`,
        );
      if (r.badImages.length) problemer.push(`images do not load: ${r.badImages.join(', ')}`);

      if (problemer.length) funn.push({ url, viewport: vp.name, problemer });
    } catch (err) {
      funn.push({ url, viewport: vp.name, problemer: [`failed: ${err.message.slice(0, 90)}`] });
    }
  }
  await ctx.close();
}
await browser.close();

if (!funn.length) {
  console.log('No findings.');
  process.exit(0);
}

for (const f of funn) {
  console.log(`[${f.viewport}] ${f.url.replace(BASE, '') || '/'}`);
  for (const p of f.problemer) console.log(`   - ${p}`);
}
console.log(`\n${funn.length} findings.`);
process.exit(1);
