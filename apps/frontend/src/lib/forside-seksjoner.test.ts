import { describe, it, expect } from 'vitest';
import { velgAktuelt, velgLaerAvAndre, velgLenke, velgVeiledning, MAKS_AKTUELT_KORT } from './forside-seksjoner';
import type { ForsideSeksjon, VeiledningGuide } from './umbraco';

const artikkel = (id: string, slug: string) => ({
  id,
  slug,
  tittel: `Tittel ${id}`,
  ingress: `Ingress ${id}`,
  publishedAt: '2026-06-01T00:00:00Z',
});

const eksempel = (id: string, slug: string) => ({ id, slug, tittel: `Eksempel ${id}`, ingress: `Ingress ${id}` });

const ARTIKLER = ['a1', 'a2', 'a3', 'a4', 'a5'].map((id, i) => artikkel(id, `artikkel-${i + 1}`));
const EKSEMPLER = ['e1', 'e2'].map((id, i) => eksempel(id, `eksempel-${i + 1}`));

const blokk = (over: Partial<ForsideSeksjon> = {}): ForsideSeksjon =>
  ({ contentType: 'forsideAktuelt', id: 'blokk-1', overskrift: 'Aktuelt', ...over }) as ForsideSeksjon;

const hrefs = (kort: { href: string }[]) => kort.map((k) => k.href);
const KILDER = { artikler: ARTIKLER };

describe('velgLenke', () => {
  it('gives a link when both text and URL are set', () => {
    expect(velgLenke({ lenketekst: 'Se alle artikler', lenkeUrl: '/artikler' })).toEqual({
      tekst: 'Se alle artikler',
      href: '/artikler',
    });
  });

  it('gives no link when the URL is missing', () => {
    expect(velgLenke({ lenketekst: 'Se alle artikler', lenkeUrl: undefined })).toBeNull();
  });

  it('gives no link when the text is missing', () => {
    expect(velgLenke({ lenketekst: undefined, lenkeUrl: '/artikler' })).toBeNull();
  });
});

describe('velgAktuelt', () => {
  it('is not rendered when all fields are empty', () => {
    expect(velgAktuelt(blokk(), KILDER)).toBeNull();
  });

  it('is not rendered when the link text stands alone without a URL', () => {
    expect(velgAktuelt(blokk({ lenketekst: 'Se alle artikler' }), KILDER)).toBeNull();
  });

  it('shows only the link when neither article nor cards are picked', () => {
    const valg = velgAktuelt(blokk({ lenketekst: 'Se alle artikler', lenkeUrl: '/artikler' }), KILDER);
    expect(valg).toEqual({ featured: null, kort: [], lenke: { tekst: 'Se alle artikler', href: '/artikler' } });
  });

  it('does not fill in the newest articles by itself', () => {
    const valg = velgAktuelt(blokk({ fremhevetArtikkelId: 'a3' }), KILDER);
    expect(valg?.featured?.href).toBe('/artikler/artikkel-3');
    expect(valg?.kort).toEqual([]);
  });

  it('drops a featured article that does not exist in the sources', () => {
    const valg = velgAktuelt(blokk({ fremhevetArtikkelId: 'slettet', kort: [{ id: 'a2' }] }), KILDER);
    expect(valg?.featured).toBeNull();
    expect(hrefs(valg!.kort)).toEqual(['/artikler/artikkel-2']);
  });

  it('drops cards that point to something that does not exist', () => {
    const valg = velgAktuelt(blokk({ kort: [{ id: 'a1' }, { id: 'slettet' }] }), KILDER);
    expect(hrefs(valg!.kort)).toEqual(['/artikler/artikkel-1']);
  });

  it('drops a card block without a picked article', () => {
    const valg = velgAktuelt(blokk({ kort: [{}, { id: 'a1' }] }), KILDER);
    expect(hrefs(valg!.kort)).toEqual(['/artikler/artikkel-1']);
  });

  it('does not repeat the featured article among the cards', () => {
    const valg = velgAktuelt(blokk({ fremhevetArtikkelId: 'a1', kort: [{ id: 'a1' }, { id: 'a2' }] }), KILDER);
    expect(valg?.featured?.href).toBe('/artikler/artikkel-1');
    expect(hrefs(valg!.kort)).toEqual(['/artikler/artikkel-2']);
  });

  it('gives no card row when the only card is the featured one', () => {
    const valg = velgAktuelt(blokk({ fremhevetArtikkelId: 'a1', kort: [{ id: 'a1' }] }), KILDER);
    expect(valg?.featured?.href).toBe('/artikler/artikkel-1');
    expect(valg?.kort).toEqual([]);
  });

  it('does not show more cards than the card row has room for', () => {
    const valg = velgAktuelt(blokk({ kort: ARTIKLER.map((a) => ({ id: a.id })) }), KILDER);
    expect(valg?.kort).toHaveLength(MAKS_AKTUELT_KORT);
  });

  it('lets the editor\'s ingress override the article\'s own', () => {
    const valg = velgAktuelt(blokk({ kort: [{ id: 'a1', ingress: 'Egen ingress' }] }), KILDER);
    expect(valg?.kort[0].lead).toBe('Egen ingress');
  });

  describe('other than articles', () => {
    const enkel = { id: 'ev1', slug: 'eu-ki-og-konkurranse', tittel: 'EU, KI og konkurranse', ingress: 'Enkel ingress', publishedAt: '2026-08-26T00:00:00Z' };
    const guide = { id: 'v1', slug: 'kom-i-gang-med-ki', tittel: 'Kom i gang med KI', ingress: 'Guidens ingress' } as VeiledningGuide;
    const kilder = { artikler: ARTIKLER, enkleVeiledninger: [enkel], veiledninger: [guide], eksempler: EKSEMPLER };

    it('shows an enkel veiledning as featured, with a link to the veiledning', () => {
      const valg = velgAktuelt(blokk({ fremhevetArtikkelId: 'ev1' }), kilder);
      expect(valg?.featured).toMatchObject({ tittel: 'EU, KI og konkurranse', href: '/veiledning/eu-ki-og-konkurranse', lead: 'Enkel ingress' });
    });

    it('shows guides and eksempler as cards next to articles', () => {
      const valg = velgAktuelt(blokk({ kort: [{ id: 'a1' }, { id: 'v1' }, { id: 'e2' }] }), kilder);
      expect(hrefs(valg!.kort)).toEqual(['/artikler/artikkel-1', '/veiledning/kom-i-gang-med-ki', '/eksempler/eksempel-2']);
    });

    it('lets the editor\'s ingress override the veiledning\'s own', () => {
      const valg = velgAktuelt(blokk({ kort: [{ id: 'ev1', ingress: 'Egen ingress' }] }), kilder);
      expect(valg?.kort[0].lead).toBe('Egen ingress');
    });

    it('does not repeat a featured veiledning among the cards', () => {
      const valg = velgAktuelt(blokk({ fremhevetArtikkelId: 'ev1', kort: [{ id: 'ev1' }, { id: 'a1' }] }), kilder);
      expect(hrefs(valg!.kort)).toEqual(['/artikler/artikkel-1']);
    });
  });
});

describe('velgLaerAvAndre', () => {
  const laer = (over: Partial<ForsideSeksjon> = {}) =>
    blokk({ contentType: 'forsideLaerAvAndre', overskrift: 'Lær av andre', ...over });

  it('is not rendered without cards and without a link', () => {
    expect(velgLaerAvAndre(laer(), EKSEMPLER)).toBeNull();
  });

  it('shows the link even if no cards are picked', () => {
    const valg = velgLaerAvAndre(laer({ lenketekst: 'Se alle eksempler', lenkeUrl: '/eksempler' }), EKSEMPLER);
    expect(valg).toEqual({ kort: [], lenke: { tekst: 'Se alle eksempler', href: '/eksempler' } });
  });

  it('does not fill in eksempler by itself', () => {
    const valg = velgLaerAvAndre(laer({ kort: [{ id: 'e2' }] }), EKSEMPLER);
    expect(valg?.kort).toEqual([{ href: '/eksempler/eksempel-2', title: 'Eksempel e2', lead: 'Ingress e2' }]);
  });

  it('drops cards that point to something that does not exist', () => {
    const valg = velgLaerAvAndre(laer({ kort: [{ id: 'slettet' }, { id: 'e1' }] }), EKSEMPLER);
    expect(valg?.kort.map((k) => k.href)).toEqual(['/eksempler/eksempel-1']);
  });

  it('drops cards without an id', () => {
    const valg = velgLaerAvAndre(laer({ kort: [{}, { id: 'e1' }] }), EKSEMPLER);
    expect(valg?.kort.map((k) => k.href)).toEqual(['/eksempler/eksempel-1']);
  });

  it('uses the ingress on the card before the eksempel\'s own', () => {
    const valg = velgLaerAvAndre(laer({ kort: [{ id: 'e1', ingress: 'Egen ingress' }] }), EKSEMPLER);
    expect(valg?.kort[0].lead).toBe('Egen ingress');
  });

  it('gives lead undefined when neither the card nor the eksempel has an ingress', () => {
    const valg = velgLaerAvAndre(laer({ kort: [{ id: 'e3' }] }), [{ id: 'e3', slug: 'uten', tittel: 'Uten', ingress: '' }]);
    expect(valg?.kort).toStrictEqual([{ href: '/eksempler/uten', title: 'Uten', lead: undefined }]);
  });
});

describe('velgVeiledning', () => {
  const GUIDER = [{ id: 'v1', slug: 'gjor-dataene-ki-klare', tittel: 'Gjør dataene KI-klare', ingress: 'Guidens ingress' }] as VeiledningGuide[];
  const veil = (over: Partial<ForsideSeksjon> = {}) => blokk({ contentType: 'forsideVeiledning', overskrift: undefined, ...over });

  it('is not rendered without a link and without a picked veiledning', () => {
    expect(velgVeiledning(veil({ tittel: 'Gjør dataene KI-klare' }), GUIDER)).toBeNull();
  });

  it('is not rendered without a title', () => {
    expect(velgVeiledning(veil({ lenkeUrl: '/veiledning' }), GUIDER)).toBeNull();
  });

  it('inherits title, ingress and link from the picked veiledning', () => {
    const valg = velgVeiledning(veil({ veiledningId: 'v1' }), GUIDER);
    expect(valg).toMatchObject({
      tittel: 'Gjør dataene KI-klare',
      ingress: 'Guidens ingress',
      href: '/veiledning/gjor-dataene-ki-klare',
    });
  });

  it('lets the editor\'s own fields override the inherited ones', () => {
    const valg = velgVeiledning(veil({ veiledningId: 'v1', tittel: 'Egen tittel', lenkeUrl: '/egen-url' }), GUIDER);
    expect(valg).toMatchObject({ tittel: 'Egen tittel', href: '/egen-url', ingress: 'Guidens ingress' });
  });

  it('drops a picked veiledning that does not exist in the pool', () => {
    expect(velgVeiledning(veil({ veiledningId: 'slettet' }), GUIDER)).toBeNull();
  });
});

// The image hierarchy after the meeting with Sara: the override on the card beats lenkekortbilde,
// which beats the main image. Without a match it gives undefined, and then the card renders
// the default image itself.
describe('image hierarchy in aktuelt', () => {
  const media = (navn: string) => ({ url: `/media/${navn}.jpg`, width: 1200, height: 800 }) as any;

  const medBilder = (over: Record<string, unknown>) => ({
    ...artikkel('b1', 'bilde-artikkel'),
    ...over,
  });

  const kortFor = (node: Record<string, unknown>, kortBilde?: unknown) =>
    velgAktuelt(
      blokk({ kort: [{ id: 'b1', ...(kortBilde ? { bilde: kortBilde } : {}) }] as any }),
      { artikler: [node as any] },
    )!.kort[0];

  it('uses the main image when it is the only one set', () => {
    const k = kortFor(medBilder({ artikkelBilde: media('hoved') }));
    expect(k.image?.src).toContain('hoved');
  });

  it('lets the lenkekort image beat the main image', () => {
    const k = kortFor(medBilder({ artikkelBilde: media('hoved'), lenkekortBilde: media('lenkekort') }));
    expect(k.image?.src).toContain('lenkekort');
  });

  it('lets the override on the card beat both', () => {
    const k = kortFor(
      medBilder({ artikkelBilde: media('hoved'), lenkekortBilde: media('lenkekort') }),
      media('overstyrt'),
    );
    expect(k.image?.src).toContain('overstyrt');
  });

  it('gives undefined without an image, so the default image takes over', () => {
    expect(kortFor(medBilder({})).image).toBeUndefined();
  });

  // Regression guard for #738: the SEO image leaked in as content and gave veiledninger
  // an image nobody had picked. It must never come back.
  it('NEVER uses the SEO image', () => {
    expect(kortFor(medBilder({ seoBilde: media('seo') })).image).toBeUndefined();
  });
});

// Aktuelt lets the editor point to anything in the content tree, including steps and stegartikler
// nested under a guide. They are not in the source lists, so their URL
// is resolved by the caller and passed in via ekstra. Without this the card disappeared
// silently, and the editor got no message about why.
describe('aktuelt with nested content', () => {
  const steg = {
    tittel: 'Finn ut hvilke data du trenger',
    href: '/veiledning/gjoer-dataene-ki-klare/finn-ut-hvilke-data-du-trenger',
    ingress: 'Ingress fra steget',
  };

  const kortFor = (ekstra?: Map<string, any>) =>
    velgAktuelt(blokk({ kort: [{ id: 'steg-1' }] as any }), { artikler: [], ekstra });

  it('shows the card when the caller has resolved the URL', () => {
    const r = kortFor(new Map([['steg-1', steg]]));
    expect(r!.kort).toHaveLength(1);
    expect(r!.kort[0].href).toBe(steg.href);
    expect(r!.kort[0].tittel).toBe(steg.tittel);
  });

  it('drops the card when neither the lists nor ekstra know the id', () => {
    expect(kortFor(new Map())).toBeNull();
  });

  it('lets the ingress override win for nested content too', () => {
    const r = velgAktuelt(
      blokk({ kort: [{ id: 'steg-1', ingress: 'Overstyrt' }] as any }),
      { artikler: [], ekstra: new Map([['steg-1', steg]]) },
    );
    expect(r!.kort[0].lead).toBe('Overstyrt');
  });
});
