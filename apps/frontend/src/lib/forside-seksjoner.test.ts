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
  it('gir lenke når både tekst og URL er satt', () => {
    expect(velgLenke({ lenketekst: 'Se alle artikler', lenkeUrl: '/artikler' })).toEqual({
      tekst: 'Se alle artikler',
      href: '/artikler',
    });
  });

  it('gir ingen lenke når URL mangler', () => {
    expect(velgLenke({ lenketekst: 'Se alle artikler', lenkeUrl: undefined })).toBeNull();
  });

  it('gir ingen lenke når teksten mangler', () => {
    expect(velgLenke({ lenketekst: undefined, lenkeUrl: '/artikler' })).toBeNull();
  });
});

describe('velgAktuelt', () => {
  it('rendres ikke når alle felt er tomme', () => {
    expect(velgAktuelt(blokk(), KILDER)).toBeNull();
  });

  it('rendres ikke når lenketeksten står alene uten URL', () => {
    expect(velgAktuelt(blokk({ lenketekst: 'Se alle artikler' }), KILDER)).toBeNull();
  });

  it('viser kun lenka når verken artikkel eller kort er valgt', () => {
    const valg = velgAktuelt(blokk({ lenketekst: 'Se alle artikler', lenkeUrl: '/artikler' }), KILDER);
    expect(valg).toEqual({ featured: null, kort: [], lenke: { tekst: 'Se alle artikler', href: '/artikler' } });
  });

  it('fyller ikke inn nyeste artikler av seg selv', () => {
    const valg = velgAktuelt(blokk({ fremhevetArtikkelId: 'a3' }), KILDER);
    expect(valg?.featured?.href).toBe('/artikler/artikkel-3');
    expect(valg?.kort).toEqual([]);
  });

  it('dropper fremhevet artikkel som ikke finnes i kildene', () => {
    const valg = velgAktuelt(blokk({ fremhevetArtikkelId: 'slettet', kort: [{ id: 'a2' }] }), KILDER);
    expect(valg?.featured).toBeNull();
    expect(hrefs(valg!.kort)).toEqual(['/artikler/artikkel-2']);
  });

  it('dropper kort som peker på noe som ikke finnes', () => {
    const valg = velgAktuelt(blokk({ kort: [{ id: 'a1' }, { id: 'slettet' }] }), KILDER);
    expect(hrefs(valg!.kort)).toEqual(['/artikler/artikkel-1']);
  });

  it('dropper kort-blokk uten valgt artikkel', () => {
    const valg = velgAktuelt(blokk({ kort: [{}, { id: 'a1' }] }), KILDER);
    expect(hrefs(valg!.kort)).toEqual(['/artikler/artikkel-1']);
  });

  it('gjentar ikke den fremhevede artikkelen blant kortene', () => {
    const valg = velgAktuelt(blokk({ fremhevetArtikkelId: 'a1', kort: [{ id: 'a1' }, { id: 'a2' }] }), KILDER);
    expect(valg?.featured?.href).toBe('/artikler/artikkel-1');
    expect(hrefs(valg!.kort)).toEqual(['/artikler/artikkel-2']);
  });

  it('gir ingen kortrad når eneste kort er den fremhevede', () => {
    const valg = velgAktuelt(blokk({ fremhevetArtikkelId: 'a1', kort: [{ id: 'a1' }] }), KILDER);
    expect(valg?.featured?.href).toBe('/artikler/artikkel-1');
    expect(valg?.kort).toEqual([]);
  });

  it('viser ikke flere kort enn kortraden har plass til', () => {
    const valg = velgAktuelt(blokk({ kort: ARTIKLER.map((a) => ({ id: a.id })) }), KILDER);
    expect(valg?.kort).toHaveLength(MAKS_AKTUELT_KORT);
  });

  it('lar redaktørens ingress overstyre artikkelens egen', () => {
    const valg = velgAktuelt(blokk({ kort: [{ id: 'a1', ingress: 'Egen ingress' }] }), KILDER);
    expect(valg?.kort[0].lead).toBe('Egen ingress');
  });

  describe('annet enn artikler', () => {
    const enkel = { id: 'ev1', slug: 'eu-ki-og-konkurranse', tittel: 'EU, KI og konkurranse', ingress: 'Enkel ingress', publishedAt: '2026-08-26T00:00:00Z' };
    const guide = { id: 'v1', slug: 'kom-i-gang-med-ki', tittel: 'Kom i gang med KI', ingress: 'Guidens ingress' } as VeiledningGuide;
    const kilder = { artikler: ARTIKLER, enkleVeiledninger: [enkel], veiledninger: [guide], eksempler: EKSEMPLER };

    it('viser en enkel veiledning som fremhevet, med lenke til veiledningen', () => {
      const valg = velgAktuelt(blokk({ fremhevetArtikkelId: 'ev1' }), kilder);
      expect(valg?.featured).toMatchObject({ tittel: 'EU, KI og konkurranse', href: '/veiledning/eu-ki-og-konkurranse', lead: 'Enkel ingress' });
    });

    it('viser guider og eksempler som kort ved siden av artikler', () => {
      const valg = velgAktuelt(blokk({ kort: [{ id: 'a1' }, { id: 'v1' }, { id: 'e2' }] }), kilder);
      expect(hrefs(valg!.kort)).toEqual(['/artikler/artikkel-1', '/veiledning/kom-i-gang-med-ki', '/eksempler/eksempel-2']);
    });

    it('lar redaktørens ingress overstyre veiledningens egen', () => {
      const valg = velgAktuelt(blokk({ kort: [{ id: 'ev1', ingress: 'Egen ingress' }] }), kilder);
      expect(valg?.kort[0].lead).toBe('Egen ingress');
    });

    it('gjentar ikke en fremhevet veiledning blant kortene', () => {
      const valg = velgAktuelt(blokk({ fremhevetArtikkelId: 'ev1', kort: [{ id: 'ev1' }, { id: 'a1' }] }), kilder);
      expect(hrefs(valg!.kort)).toEqual(['/artikler/artikkel-1']);
    });
  });
});

describe('velgLaerAvAndre', () => {
  const laer = (over: Partial<ForsideSeksjon> = {}) =>
    blokk({ contentType: 'forsideLaerAvAndre', overskrift: 'Lær av andre', ...over });

  it('rendres ikke uten kort og uten lenke', () => {
    expect(velgLaerAvAndre(laer(), EKSEMPLER)).toBeNull();
  });

  it('viser lenka selv om ingen kort er valgt', () => {
    const valg = velgLaerAvAndre(laer({ lenketekst: 'Se alle eksempler', lenkeUrl: '/eksempler' }), EKSEMPLER);
    expect(valg).toEqual({ kort: [], lenke: { tekst: 'Se alle eksempler', href: '/eksempler' } });
  });

  it('fyller ikke inn eksempler av seg selv', () => {
    const valg = velgLaerAvAndre(laer({ kort: [{ id: 'e2' }] }), EKSEMPLER);
    expect(valg?.kort).toEqual([{ href: '/eksempler/eksempel-2', title: 'Eksempel e2', lead: 'Ingress e2' }]);
  });

  it('dropper kort som peker på noe som ikke finnes', () => {
    const valg = velgLaerAvAndre(laer({ kort: [{ id: 'slettet' }, { id: 'e1' }] }), EKSEMPLER);
    expect(valg?.kort.map((k) => k.href)).toEqual(['/eksempler/eksempel-1']);
  });
});

describe('velgVeiledning', () => {
  const GUIDER = [{ id: 'v1', slug: 'gjor-dataene-ki-klare', tittel: 'Gjør dataene KI-klare', ingress: 'Guidens ingress' }] as VeiledningGuide[];
  const veil = (over: Partial<ForsideSeksjon> = {}) => blokk({ contentType: 'forsideVeiledning', overskrift: undefined, ...over });

  it('rendres ikke uten lenke og uten valgt veiledning', () => {
    expect(velgVeiledning(veil({ tittel: 'Gjør dataene KI-klare' }), GUIDER)).toBeNull();
  });

  it('rendres ikke uten tittel', () => {
    expect(velgVeiledning(veil({ lenkeUrl: '/veiledning' }), GUIDER)).toBeNull();
  });

  it('arver tittel, ingress og lenke fra valgt veiledning', () => {
    const valg = velgVeiledning(veil({ veiledningId: 'v1' }), GUIDER);
    expect(valg).toMatchObject({
      tittel: 'Gjør dataene KI-klare',
      ingress: 'Guidens ingress',
      href: '/veiledning/gjor-dataene-ki-klare',
    });
  });

  it('lar redaktørens egne felt overstyre arven', () => {
    const valg = velgVeiledning(veil({ veiledningId: 'v1', tittel: 'Egen tittel', lenkeUrl: '/egen-url' }), GUIDER);
    expect(valg).toMatchObject({ tittel: 'Egen tittel', href: '/egen-url', ingress: 'Guidens ingress' });
  });

  it('dropper valgt veiledning som ikke finnes i poolen', () => {
    expect(velgVeiledning(veil({ veiledningId: 'slettet' }), GUIDER)).toBeNull();
  });
});
