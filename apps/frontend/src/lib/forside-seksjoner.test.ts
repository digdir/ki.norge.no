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

const slugs = (kort: { slug: string }[]) => kort.map((k) => k.slug);

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
    expect(velgAktuelt(blokk(), ARTIKLER)).toBeNull();
  });

  it('rendres ikke når lenketeksten står alene uten URL', () => {
    expect(velgAktuelt(blokk({ lenketekst: 'Se alle artikler' }), ARTIKLER)).toBeNull();
  });

  it('viser kun lenka når verken artikkel eller kort er valgt', () => {
    const valg = velgAktuelt(blokk({ lenketekst: 'Se alle artikler', lenkeUrl: '/artikler' }), ARTIKLER);
    expect(valg).toEqual({ featured: null, kort: [], lenke: { tekst: 'Se alle artikler', href: '/artikler' } });
  });

  it('fyller ikke inn nyeste artikler av seg selv', () => {
    const valg = velgAktuelt(blokk({ fremhevetArtikkelId: 'a3' }), ARTIKLER);
    expect(valg?.featured?.slug).toBe('artikkel-3');
    expect(valg?.kort).toEqual([]);
  });

  it('dropper fremhevet artikkel som ikke finnes i poolen', () => {
    const valg = velgAktuelt(blokk({ fremhevetArtikkelId: 'slettet', kort: [{ id: 'a2' }] }), ARTIKLER);
    expect(valg?.featured).toBeNull();
    expect(slugs(valg!.kort)).toEqual(['artikkel-2']);
  });

  it('dropper kort som peker på noe som ikke finnes', () => {
    const valg = velgAktuelt(blokk({ kort: [{ id: 'a1' }, { id: 'slettet' }] }), ARTIKLER);
    expect(slugs(valg!.kort)).toEqual(['artikkel-1']);
  });

  it('dropper kort-blokk uten valgt artikkel', () => {
    const valg = velgAktuelt(blokk({ kort: [{}, { id: 'a1' }] }), ARTIKLER);
    expect(slugs(valg!.kort)).toEqual(['artikkel-1']);
  });

  it('gjentar ikke den fremhevede artikkelen blant kortene', () => {
    const valg = velgAktuelt(blokk({ fremhevetArtikkelId: 'a1', kort: [{ id: 'a1' }, { id: 'a2' }] }), ARTIKLER);
    expect(valg?.featured?.slug).toBe('artikkel-1');
    expect(slugs(valg!.kort)).toEqual(['artikkel-2']);
  });

  it('gir ingen kortrad når eneste kort er den fremhevede', () => {
    const valg = velgAktuelt(blokk({ fremhevetArtikkelId: 'a1', kort: [{ id: 'a1' }] }), ARTIKLER);
    expect(valg?.featured?.slug).toBe('artikkel-1');
    expect(valg?.kort).toEqual([]);
  });

  it('viser ikke flere kort enn kortraden har plass til', () => {
    const valg = velgAktuelt(blokk({ kort: ARTIKLER.map((a) => ({ id: a.id })) }), ARTIKLER);
    expect(valg?.kort).toHaveLength(MAKS_AKTUELT_KORT);
  });

  it('lar redaktørens ingress overstyre artikkelens egen', () => {
    const valg = velgAktuelt(blokk({ kort: [{ id: 'a1', ingress: 'Egen ingress' }] }), ARTIKLER);
    expect(valg?.kort[0].lead).toBe('Egen ingress');
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
