// Måler bildeboksen på hver plassering i fire bredder, og feiler hvis den ikke
// har formatets form. Fanger det hvis CSS begynner å kutte bildene igjen, eller
// hvis en boks igjen skifter form med bredden eller tekstlengden.
//
// Kjøres mot mock-CMS-et, der testbildene er satt. Bildene hentes fra
// tools/mock-cms/media, og alle andre forespørsler ut av maskinen stoppes:
//   pnpm run frontend:dev:mock --port 4328
//   CI=1 PLAYWRIGHT_BASE_URL=http://localhost:4328 pnpm exec playwright test tests/bildeformater.spec.ts --project=chromium
// Med BILDEFORMAT_MALING=<fil> skrives hver måling til fila som JSON-linjer.
import { test, expect, type Page } from '@playwright/test';
import { appendFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BILDEFORMATER, type Bildeformat } from '../src/lib/bildeformater';

const BREDDER = [375, 768, 1024, 1280];
const MEDIA = fileURLToPath(new URL('../tools/mock-cms/media', import.meta.url));

interface Plassering {
  navn: string;
  boks: string;
  format: Bildeformat;
}

const SIDER: Record<string, Plassering[]> = {
  '/': [
    { navn: 'Fremhevet kort, forsiden', boks: '.news-card--featured .news-card-image', format: 'bred' },
    { navn: 'Små kort, forsiden', boks: '.news-card--image .news-card-image', format: 'kort' },
  ],
  '/artikler': [
    { navn: 'Fremhevet kort, /artikler', boks: '.news-card--featured .news-card-image', format: 'bred' },
    { navn: 'Små kort, /artikler', boks: '.news-card--image .news-card-image', format: 'kort' },
  ],
  '/artikler/slik-kom-nav-i-gang-med-ki': [
    { navn: 'Toppbilde, artikkel', boks: '.article-hero-image', format: 'topp' },
    { navn: 'Relaterte artikler', boks: '.news-card--image .news-card-image', format: 'kort' },
  ],
  '/eksempler': [{ navn: 'Eksempelkort, /eksempler', boks: '.featured-card-image', format: 'kort' }],
  '/eksempler/chatbot-i-kommunen': [{ navn: 'Toppbilde, eksempel', boks: '.article-hero-image', format: 'topp' }],
  '/om-oss': [
    { navn: 'Toppbilde, om oss', boks: '.article-hero-image', format: 'topp' },
    { navn: 'Små kort, om oss', boks: '.news-card--image .news-card-image', format: 'kort' },
  ],
  '/kalender/frokostseminar-ki': [{ navn: 'Små kort, kalender', boks: '.news-card--image .news-card-image', format: 'kort' }],
  '/veiledning/gjor-dataene-ki-klare': [{ navn: 'Toppbilde, veiledning', boks: '.article-hero-image', format: 'topp' }],
  '/veiledning/kom-i-gang-med-ki/vurder-data-personvern/personvern-i-praksis': [
    { navn: 'Toppbilde, stegartikkel', boks: '.article-hero-image', format: 'topp' },
  ],
  '/sandkasse': [{ navn: 'Toppbilde, sandkassen', boks: '.article-hero-image', format: 'sandkasse' }],
};

async function hentBilderLokalt(page: Page) {
  await page.route(
    (url) => url.hostname !== 'localhost',
    (route) => {
      const { pathname } = new URL(route.request().url());
      const fil = `${MEDIA}${decodeURIComponent(pathname).replace(/^\/media/, '')}`;
      return pathname.startsWith('/media/') && existsSync(fil) ? route.fulfill({ path: fil }) : route.abort();
    },
  );
}

// Den synlige delen av bildet i boksen. Et forelder-element med overflow kan kutte den.
function malBokser(selector: string) {
  return [...document.querySelectorAll(selector)].map((boks) => {
    const el = boks.querySelector('img, .standardbilde') ?? boks;
    let { left, top, right, bottom } = el.getBoundingClientRect();
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const r = p.getBoundingClientRect();
      left = Math.max(left, r.left);
      top = Math.max(top, r.top);
      right = Math.min(right, r.right);
      bottom = Math.min(bottom, r.bottom);
    }
    return { bredde: Math.max(0, right - left), hoyde: Math.max(0, bottom - top) };
  });
}

for (const [side, plasseringer] of Object.entries(SIDER)) {
  test(`bildene på ${side} har formatets form`, async ({ page }) => {
    await hentBilderLokalt(page);
    const svar = await page.goto(side);
    expect(svar?.status()).toBe(200);

    for (const bredde of BREDDER) {
      await page.setViewportSize({ width: bredde, height: 900 });
      await page.evaluate(() => new Promise(requestAnimationFrame));

      for (const p of plasseringer) {
        const bokser = await page.evaluate(malBokser, p.boks);
        expect(bokser.length, `${p.navn} finnes ikke på ${side}`).toBeGreaterThan(0);
        const [fb, fh] = BILDEFORMATER[p.format].form;

        for (const { bredde: w, hoyde: h } of bokser) {
          if (process.env.BILDEFORMAT_MALING) {
            appendFileSync(process.env.BILDEFORMAT_MALING, `${JSON.stringify({ plassering: p.navn, format: p.format, vindu: bredde, bredde: w, hoyde: h })}\n`);
          }
          expect.soft(Math.abs(h - (w * fh) / fb), `${p.navn} ved ${bredde} px er ${w.toFixed(1)}×${h.toFixed(1)}, ikke ${fb}:${fh}`).toBeLessThanOrEqual(1);
        }
      }
    }
  });
}
