/**
 * Agent Skills Discovery (RFC v0.2.0): publiserer veiledningene som
 * maskinlesbare skills på /.well-known/agent-skills/index.json.
 *
 * Hver veiledning blir én skill med en SKILL.md som oppsummerer den og peker på
 * markdown-variantene av selve sidene. Indeksen oppgir en sha256 av SKILL.md, så
 * de to må genereres fra samme kilde. Derfor bygges alt i én cachet operasjon
 * som begge rutene leser, i stedet for at hver rute regner ut sitt eget.
 *
 * https://github.com/cloudflare/agent-skills-discovery-rfc
 */
import {
  fetchAllPublishedContent,
  resolveContentUrl,
  type RawContentNode,
} from './umbraco';
import { isExcludedPath } from './sitemap';
import { markdownPathFor } from './html-to-markdown';

export const SKILLS_SCHEMA = 'https://schemas.agentskills.io/discovery/0.2.0/schema.json';
export const SKILLS_BASE_PATH = '/.well-known/agent-skills';

// Innholdstypene som utgjør et selvstendig veiledningsløp. Stegene under en
// guide blir innhold i guidens skill, ikke egne skills.
const SKILL_TYPES = new Set(['veiledningGuide', 'enkelVeiledning']);

const DESCRIPTION_MAX_LENGTH = 1024;
const CACHE_TTL_MS = 60 * 60 * 1000;

export interface Skill {
  name: string;
  description: string;
  url: string;
  digest: string;
  markdown: string;
}

type Entry = {
  path: string;
  title: string;
  summary?: string;
};

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value !== 'string') continue;
    const trimmed = value.replace(/\s+/g, ' ').trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
}

/** RFC-en krever 1-64 tegn, små bokstaver, sifre og bindestrek. */
export function toSkillName(slug: string): string {
  return slug
    .toLowerCase()
    .replaceAll('æ', 'ae')
    .replaceAll('ø', 'o')
    .replaceAll('å', 'a')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 64);
}

function yamlString(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function titleOf(node: RawContentNode): string {
  const p = node.properties ?? {};
  return firstNonEmptyString(p.tittel, node.name) ?? 'Uten tittel';
}

function summaryOf(node: RawContentNode): string | undefined {
  const p = node.properties ?? {};
  const raw = firstNonEmptyString(p.ingress, p.seoBeskrivelse);
  // Samme grep som i llms.txt: redaksjonelle rester uten bokstaver er støy.
  return raw && /\p{L}/u.test(raw) ? raw : undefined;
}

function absolute(baseUrl: string, path: string): string {
  return new URL(path, baseUrl).toString();
}

/**
 * SKILL.md er en oppsummering med lenker videre, ikke en kopi av hele løpet.
 * Full tekst ligger allerede som markdown på .md-URLene, og å duplisere den her
 * ville gitt to kilder som kan komme i utakt.
 */
function buildSkillMarkdown(
  name: string,
  guide: Entry,
  steps: Entry[],
  baseUrl: string,
): string {
  const lines = [
    '---',
    `name: ${name}`,
    `description: ${yamlString(guide.summary ?? guide.title)}`,
    '---',
    '',
    `# ${guide.title}`,
    '',
  ];

  if (guide.summary) lines.push(guide.summary, '');

  lines.push(
    'Veiledning fra KI Norge, Digitaliseringsdirektoratets portal for kunstig',
    'intelligens i offentlig sektor. Innholdet er på norsk.',
    '',
    `Kilde: ${absolute(baseUrl, guide.path)}`,
    `Samme side som markdown: ${absolute(baseUrl, markdownPathFor(guide.path))}`,
    '',
  );

  if (steps.length) {
    lines.push('## Innhold', '');
    for (const step of steps) {
      const link = `- [${step.title}](${absolute(baseUrl, markdownPathFor(step.path))})`;
      lines.push(step.summary ? `${link}: ${truncate(step.summary, 200)}` : link);
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function resolveEntry(node: RawContentNode): Promise<Entry | null> {
  try {
    const path = await resolveContentUrl(node);
    if (!path || isExcludedPath(path)) return null;
    return { path, title: titleOf(node), summary: summaryOf(node) };
  } catch (error) {
    console.error(`[agent-skills] kunne ikke resolve node ${node.id}`, error);
    return null;
  }
}

async function buildSkillsUncached(baseUrl: string): Promise<Skill[]> {
  let nodes: RawContentNode[] = [];
  try {
    nodes = await fetchAllPublishedContent();
  } catch (error) {
    console.error('[agent-skills] crawl av innhold feilet', error);
    return [];
  }

  const resolved = await Promise.all(
    nodes.map(async (node) => ({ node, entry: await resolveEntry(node) })),
  );

  const guides: Entry[] = [];
  const others: Entry[] = [];
  for (const { node, entry } of resolved) {
    if (!entry) continue;
    if (SKILL_TYPES.has(node.contentType)) guides.push(entry);
    else others.push(entry);
  }

  // Stegene tilhører guiden hvis stien ligger under den. Enklere og mer robust
  // enn ancestor-oppslag, siden ruta allerede koder hierarkiet.
  const skills = await Promise.all(
    guides.map(async (guide) => {
      const name = toSkillName(guide.path.split('/').pop() ?? '');
      if (!name) return null;

      const steps = others
        .filter((entry) => entry.path.startsWith(`${guide.path}/`))
        .sort((a, b) => a.path.localeCompare(b.path, 'nb'));

      const markdown = buildSkillMarkdown(name, guide, steps, baseUrl);
      return {
        name,
        description: truncate(guide.summary ?? guide.title, DESCRIPTION_MAX_LENGTH),
        url: `${SKILLS_BASE_PATH}/${name}/SKILL.md`,
        digest: `sha256:${await sha256Hex(markdown)}`,
        markdown,
      } satisfies Skill;
    }),
  );

  return skills
    .filter((skill): skill is Skill => skill !== null)
    .sort((a, b) => a.name.localeCompare(b.name, 'nb'));
}

const cache = new Map<string, { expiresAt: number; skillsPromise: Promise<Skill[]> }>();

/**
 * Cachet slik at indeksen og SKILL.md-rutene leser nøyaktig samme generasjon.
 * Uten det kunne en digest i indeksen beskrevet en litt annen SKILL.md enn den
 * som faktisk blir servert.
 */
export async function buildSkills(baseUrl: string): Promise<Skill[]> {
  const key = baseUrl.replace(/\/+$/, '');
  const now = Date.now();
  const cached = cache.get(key);
  if (cached && cached.expiresAt > now) return cached.skillsPromise;

  const skillsPromise = buildSkillsUncached(baseUrl);
  cache.set(key, { expiresAt: now + CACHE_TTL_MS, skillsPromise });

  try {
    return await skillsPromise;
  } catch (error) {
    if (cache.get(key)?.skillsPromise === skillsPromise) cache.delete(key);
    throw error;
  }
}

export function buildSkillsIndex(skills: Skill[]): string {
  return JSON.stringify(
    {
      $schema: SKILLS_SCHEMA,
      skills: skills.map(({ name, description, url, digest }) => ({
        name,
        type: 'skill-md',
        description,
        url,
        digest,
      })),
    },
    null,
    2,
  );
}
