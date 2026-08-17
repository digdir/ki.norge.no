import { describe, expect, test, vi, afterEach } from 'vitest';

vi.mock('./umbraco', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./umbraco')>();
  return { ...actual, fetchAllPublishedContent: vi.fn() };
});

import { fetchAllPublishedContent, type RawContentNode } from './umbraco';
import { buildSkills, buildSkillsIndex, sha256Hex, toSkillName, SKILLS_SCHEMA } from './agent-skills';

const mockedCrawl = vi.mocked(fetchAllPublishedContent);

let baseCounter = 0;
async function skillsFor(nodes: RawContentNode[]) {
  baseCounter += 1;
  const base = `https://s${baseCounter}.example`;
  mockedCrawl.mockResolvedValue(nodes);
  return { skills: await buildSkills(base), base };
}

const GUIDE: RawContentNode = {
  id: 'g1',
  contentType: 'veiledningGuide',
  properties: { slug: 'gjor-dataene-ki-klare', tittel: 'Gjør dataene KI-klare', ingress: 'Om KI-klare data.' },
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('toSkillName', () => {
  test.each([
    ['gjor-dataene-ki-klare', 'gjor-dataene-ki-klare'],
    ['Etikk Og KI', 'etikk-og-ki'],
    ['blå-løsning', 'bla-losning'],
    ['--rar--slug--', 'rar-slug'],
  ])('%s -> %s', (input, expected) => {
    expect(toSkillName(input)).toBe(expected);
  });

  test('holder seg innenfor RFC-ens 64 tegn og tegnsett', () => {
    const name = toSkillName('a'.repeat(200));
    expect(name.length).toBeLessThanOrEqual(64);
    expect(name).toMatch(/^[a-z0-9-]+$/);
  });
});

describe('buildSkills', () => {
  test('veiledninger blir skills, andre innholdstyper blir det ikke', async () => {
    const { skills } = await skillsFor([
      GUIDE,
      { id: 'e1', contentType: 'enkelVeiledning', properties: { slug: 'etikk-og-ki', tittel: 'Etikk og KI' } },
      { id: 'a1', contentType: 'artikkel', properties: { slug: 'en-artikkel', tittel: 'En artikkel' } },
      { id: 'x1', contentType: 'eksempel', properties: { slug: 'et-eksempel', tittel: 'Et eksempel' } },
    ]);

    expect(skills.map((s) => s.name).sort()).toEqual(['etikk-og-ki', 'gjor-dataene-ki-klare']);
  });

  test('digesten er sha256 av nøyaktig den markdownen som serveres', async () => {
    const { skills } = await skillsFor([GUIDE]);
    const skill = skills[0];
    expect(skill.digest).toBe(`sha256:${await sha256Hex(skill.markdown)}`);
    expect(skill.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  test('steg under guiden havner i innholdslista, ikke som egne skills', async () => {
    // veiledningSteg arver guidens slug i URLen, og resolveContentUrl slår opp
    // ancestors over Delivery API. Å mocke den eksporten hjelper ikke, siden
    // kallet skjer internt i umbraco.ts. Derfor stubbes fetch.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [{ contentType: 'veiledningGuide', properties: { slug: 'gjor-dataene-ki-klare' } }],
        }),
      }),
    );

    const { skills } = await skillsFor([
      GUIDE,
      {
        id: 's1',
        contentType: 'veiledningSteg',
        properties: { slug: 'kartlegg-datakilder', tittel: 'Kartlegg datakilder' },
      },
    ]);

    expect(skills).toHaveLength(1);
    expect(skills[0].markdown).toContain('Kartlegg datakilder');
    // Peker på markdown-varianten, ikke HTML-siden.
    expect(skills[0].markdown).toContain('/veiledning/gjor-dataene-ki-klare/kartlegg-datakilder.md');
  });

  test('SKILL.md har frontmatter med navn og beskrivelse', async () => {
    const { skills } = await skillsFor([GUIDE]);
    const lines = skills[0].markdown.split('\n');
    expect(lines[0]).toBe('---');
    expect(lines[1]).toBe('name: gjor-dataene-ki-klare');
    expect(lines[2]).toContain('description: "Om KI-klare data."');
  });

  test('beskrivelsen faller tilbake på tittelen og kuttes på 1024 tegn', async () => {
    const long = 'ord '.repeat(600).trim();
    const { skills } = await skillsFor([
      { id: 'g2', contentType: 'veiledningGuide', properties: { slug: 'uten-ingress', tittel: 'Uten ingress' } },
      { id: 'g3', contentType: 'veiledningGuide', properties: { slug: 'lang', tittel: 'Lang', ingress: long } },
    ]);

    const utenIngress = skills.find((s) => s.name === 'uten-ingress')!;
    const lang = skills.find((s) => s.name === 'lang')!;
    expect(utenIngress.description).toBe('Uten ingress');
    expect(lang.description.length).toBeLessThanOrEqual(1024);
  });

  test('tom crawl gir tom liste, ikke feil', async () => {
    const { skills } = await skillsFor([]);
    expect(skills).toEqual([]);
  });
});

describe('buildSkillsIndex', () => {
  test('følger RFC v0.2.0 sitt format', async () => {
    const { skills } = await skillsFor([GUIDE]);
    const index = JSON.parse(buildSkillsIndex(skills));

    expect(index.$schema).toBe(SKILLS_SCHEMA);
    expect(index.skills).toHaveLength(1);

    const entry = index.skills[0];
    expect(Object.keys(entry).sort()).toEqual(['description', 'digest', 'name', 'type', 'url']);
    expect(entry.type).toBe('skill-md');
    expect(entry.url).toBe('/.well-known/agent-skills/gjor-dataene-ki-klare/SKILL.md');
    // Selve markdownen skal ikke ligge i indeksen.
    expect(JSON.stringify(index)).not.toContain('frontmatter');
  });

  test('tom liste gir fortsatt et gyldig dokument', () => {
    const index = JSON.parse(buildSkillsIndex([]));
    expect(index.$schema).toBe(SKILLS_SCHEMA);
    expect(index.skills).toEqual([]);
  });
});
