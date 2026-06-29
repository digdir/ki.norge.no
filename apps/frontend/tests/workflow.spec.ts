import { test, expect } from '@playwright/test';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Umbraco CMS workflow and editorial integration tests.
 *
 * Tests verify:
 *   - Content Delivery API serves seeded content correctly
 *   - Auth guards reject unauthenticated requests
 *   - Backoffice login page renders
 *   - User groups and access levels are configured (3 orgs, writer/editor roles)
 *   - 3-stage workflow approval groups exist
 *   - All 6 document types are registered with correct properties
 *   - Seeded content is published and accessible
 *
 * Requires: Umbraco running on localhost:5000 with seeded database.
 */

const CMS = process.env.UMBRACO_URL ?? 'http://localhost:5000';

// ── Database helper ─────────────────────────────────────────────

const DB_PATH =
  process.env.UMBRACO_DB ??
  path.resolve(__dirname, '../../cms-umbraco/umbraco/Data/.sqlite.db');

function sql(query: string): string {
  return execSync(`sqlite3 "${DB_PATH}" "${query}"`, {
    encoding: 'utf-8',
  }).trim();
}

function sqlRows(query: string): string[][] {
  const out = sql(query);
  if (!out) return [];
  return out.split('\n').map((line) => line.split('|'));
}

function sqlCount(query: string): number {
  return parseInt(sql(query), 10);
}

// ── Content Delivery API ────────────────────────────────────────

test.describe('Content Delivery API', () => {
  const api = `${CMS}/umbraco/delivery/api/v2/content`;

  test('returns seeded content items', async ({ request }) => {
    const res = await request.get(api, {
      params: { take: '50' },
      ignoreHTTPSErrors: true,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.total).toBeGreaterThanOrEqual(25);
    expect(body.items.length).toBeGreaterThanOrEqual(20);
  });

  test('can filter by content type: artikkel', async ({ request }) => {
    const res = await request.get(api, {
      params: { filter: 'contentType:artikkel' },
      ignoreHTTPSErrors: true,
    });
    const body = await res.json();
    expect(body.total).toBeGreaterThanOrEqual(4);
    for (const item of body.items) {
      expect(item.contentType).toBe('artikkel');
    }
  });

  test('can filter by content type: side', async ({ request }) => {
    const res = await request.get(api, {
      params: { filter: 'contentType:side' },
      ignoreHTTPSErrors: true,
    });
    const body = await res.json();
    expect(body.total).toBeGreaterThanOrEqual(3);
    for (const item of body.items) {
      expect(item.contentType).toBe('side');
    }
  });

  test('can filter by content type: eksempel', async ({ request }) => {
    const res = await request.get(api, {
      params: { filter: 'contentType:eksempel' },
      ignoreHTTPSErrors: true,
    });
    const body = await res.json();
    expect(body.total).toBeGreaterThanOrEqual(4);
    for (const item of body.items) {
      expect(item.contentType).toBe('eksempel');
    }
  });

  test('artikkel items have expected properties', async ({ request }) => {
    const res = await request.get(api, {
      params: { filter: 'contentType:artikkel', take: '1' },
      ignoreHTTPSErrors: true,
    });
    const body = await res.json();
    const item = body.items[0];

    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('contentType', 'artikkel');
    expect(item).toHaveProperty('name');
    expect(item.properties).toHaveProperty('tittel');
    expect(item.properties).toHaveProperty('slug');
    expect(item.properties).toHaveProperty('innhold');
    expect(item.properties.tittel).toBeTruthy();
    expect(item.properties.slug).toBeTruthy();
  });

  test('eksempel items have organisation and status fields', async ({
    request,
  }) => {
    const res = await request.get(api, {
      params: { filter: 'contentType:eksempel', take: '1' },
      ignoreHTTPSErrors: true,
    });
    const { items } = await res.json();
    expect(items[0].properties).toHaveProperty('organisasjon');
    expect(items[0].properties).toHaveProperty('verktoy');
    expect(items[0].properties).toHaveProperty('resultater');
    expect(items[0].properties).toHaveProperty('status');
    expect(items[0].properties.organisasjon).toBeTruthy();
  });

  test('side items have SEO fields', async ({ request }) => {
    const res = await request.get(api, {
      params: { filter: 'contentType:side', take: '10' },
      ignoreHTTPSErrors: true,
    });
    const { items } = await res.json();
    const omOss = items.find((i: any) => i.properties.slug === 'om-oss');
    expect(omOss).toBeTruthy();
    expect(omOss.properties.seoBeskrivelse).toBeTruthy();
  });

  test('rich text content is returned as structured JSON', async ({
    request,
  }) => {
    const res = await request.get(api, {
      params: { filter: 'contentType:artikkel', take: '1' },
      ignoreHTTPSErrors: true,
    });
    const { items } = await res.json();
    const innhold = items[0].properties.innhold;

    expect(innhold).toHaveProperty('tag', '#root');
    expect(innhold).toHaveProperty('elements');
    expect(innhold.elements.length).toBeGreaterThan(0);
  });

  test('server status endpoint reports running', async ({ request }) => {
    const res = await request.get(
      `${CMS}/umbraco/management/api/v1/server/status`,
      { ignoreHTTPSErrors: true }
    );
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.serverStatus).toBe('Run');
  });
});

// ── Auth guards ─────────────────────────────────────────────────

test.describe('Auth guards', () => {
  test('Management API rejects unauthenticated requests', async ({
    request,
  }) => {
    const res = await request.get(
      `${CMS}/umbraco/management/api/v1/user/current`,
      { ignoreHTTPSErrors: true }
    );
    expect(res.status()).toBe(401);
  });

  test('Document API rejects unauthenticated create', async ({ request }) => {
    const res = await request.post(
      `${CMS}/umbraco/management/api/v1/document`,
      {
        data: { name: 'Test', contentType: 'artikkel' },
        ignoreHTTPSErrors: true,
      }
    );
    expect(res.status()).toBe(401);
  });

  test('User list rejects unauthenticated requests', async ({ request }) => {
    const res = await request.get(`${CMS}/umbraco/management/api/v1/user`, {
      ignoreHTTPSErrors: true,
    });
    expect(res.status()).toBe(401);
  });

  test('Publish endpoint rejects unauthenticated requests', async ({
    request,
  }) => {
    const res = await request.put(
      `${CMS}/umbraco/management/api/v1/document/00000000-0000-0000-0000-000000000000/publish`,
      { data: {}, ignoreHTTPSErrors: true }
    );
    expect([401, 403]).toContain(res.status());
  });
});

// ── Backoffice authentication ───────────────────────────────────

test.describe('Backoffice authentication', () => {
  test('admin can reach backoffice shell', async ({ request }) => {
    // Use raw HTTP to verify the backoffice shell HTML is served,
    // avoiding the SPA's client-side OAuth redirect (which requires HTTPS)
    const res = await request.get(`${CMS}/umbraco`, {
      ignoreHTTPSErrors: true,
    });
    expect(res.status()).toBe(200);

    const html = await res.text();
    expect(html).toContain('<title>Umbraco</title>');
    expect(html).toContain('<umb-app>');
    expect(html).toContain('app.element.js');
  });

});

// ── User groups and access levels ───────────────────────────────

test.describe('User groups and access levels', () => {
  test('7 users exist (1 admin + 6 demo)', () => {
    const count = sqlCount('SELECT COUNT(*) FROM umbracoUser');
    expect(count).toBe(7);
  });

  test('demo users from all 3 organisations exist', () => {
    const rows = sqlRows('SELECT userEmail FROM umbracoUser ORDER BY userEmail');
    const emails = rows.map((r) => r[0]);

    // Digdir
    expect(emails).toContain('kari@digdir.no');
    expect(emails).toContain('ola@digdir.no');
    // Nkom
    expect(emails).toContain('per@nkom.no');
    expect(emails).toContain('lisa@nkom.no');
    // KS
    expect(emails).toContain('erik@ks.no');
    expect(emails).toContain('marte@ks.no');
  });

  test('admin user exists', () => {
    const rows = sqlRows(
      "SELECT userEmail FROM umbracoUser WHERE userEmail = 'admin@kinorge.no'"
    );
    expect(rows.length).toBe(1);
    expect(rows[0][0]).toBe('admin@kinorge.no');
  });

  test('writers are assigned to the writer group', () => {
    const rows = sqlRows(
      `SELECT u.userEmail FROM umbracoUser u
       INNER JOIN umbracoUser2UserGroup ug ON u.id = ug.userId
       INNER JOIN umbracoUserGroup g ON ug.userGroupId = g.id
       WHERE g.userGroupAlias = 'writer'
       ORDER BY u.userEmail`
    );
    const emails = rows.map((r) => r[0]);

    expect(emails).toContain('kari@digdir.no');
    expect(emails).toContain('per@nkom.no');
    expect(emails).toContain('erik@ks.no');
  });

  test('editors are assigned to the editor group', () => {
    const rows = sqlRows(
      `SELECT u.userEmail FROM umbracoUser u
       INNER JOIN umbracoUser2UserGroup ug ON u.id = ug.userId
       INNER JOIN umbracoUserGroup g ON ug.userGroupId = g.id
       WHERE g.userGroupAlias = 'editor'
       ORDER BY u.userEmail`
    );
    const emails = rows.map((r) => r[0]);

    expect(emails).toContain('ola@digdir.no');
    expect(emails).toContain('lisa@nkom.no');
    expect(emails).toContain('marte@ks.no');
  });
});

// ── Workflow approval groups ────────────────────────────────────

test.describe('Workflow approval groups', () => {
  test('3 workflow groups exist', () => {
    const count = sqlCount(
      'SELECT COUNT(*) FROM WorkflowUserGroups WHERE Deleted = 0'
    );
    expect(count).toBe(3);
  });

  test('stage 1: Intern redaktør', () => {
    const rows = sqlRows(
      "SELECT Name, Alias FROM WorkflowUserGroups WHERE GroupId = 1 AND Deleted = 0"
    );
    expect(rows.length).toBe(1);
    expect(rows[0][0]).toContain('Intern redakt');
    expect(rows[0][1]).toBe('intern-redaktor');
  });

  test('stage 2: Faglig gjennomgang', () => {
    const rows = sqlRows(
      "SELECT Name, Alias FROM WorkflowUserGroups WHERE GroupId = 2 AND Deleted = 0"
    );
    expect(rows.length).toBe(1);
    expect(rows[0][0]).toBe('Faglig gjennomgang');
    expect(rows[0][1]).toBe('faglig-gjennomgang');
  });

  test('stage 3: Publisering', () => {
    const rows = sqlRows(
      "SELECT Name, Alias FROM WorkflowUserGroups WHERE GroupId = 3 AND Deleted = 0"
    );
    expect(rows.length).toBe(1);
    expect(rows[0][0]).toBe('Publisering');
    expect(rows[0][1]).toBe('publisering');
  });

  test('global permissions route all content through all 3 stages', () => {
    const rows = sqlRows(
      'SELECT GroupId, NodeId, Permission FROM WorkflowUserGroupPermissions ORDER BY Permission'
    );
    expect(rows).toHaveLength(3);

    for (const row of rows) {
      expect(row[1]).toBe('0'); // NodeId 0 = global (all content)
    }

    // Stage 0 → Group 1, Stage 1 → Group 2, Stage 2 → Group 3
    expect(rows[0][0]).toBe('1');
    expect(rows[0][2]).toBe('0');
    expect(rows[1][0]).toBe('2');
    expect(rows[1][2]).toBe('1');
    expect(rows[2][0]).toBe('3');
    expect(rows[2][2]).toBe('2');
  });

  test('workflow settings have notifications enabled', () => {
    const value = sql('SELECT Value FROM WorkflowSettings WHERE Type = 0');
    expect(value).toBeTruthy();
    const settings = JSON.parse(value);
    expect(settings.sendNotifications).toBe(true);
  });
});

// ── Document types ──────────────────────────────────────────────

test.describe('Document types', () => {
  function getPropertyAliases(contentTypeAlias: string): string[] {
    const rows = sqlRows(
      `SELECT pt.Alias FROM cmsPropertyType pt
       INNER JOIN cmsContentType ct ON pt.contentTypeId = ct.nodeId
       WHERE ct.alias = '${contentTypeAlias}'
       ORDER BY pt.Alias`
    );
    return rows.map((r) => r[0]);
  }

  test('all 12 document types are registered (6 content + 6 containers)', () => {
    const rows = sqlRows('SELECT alias FROM cmsContentType ORDER BY alias');
    const aliases = rows.map((r) => r[0]);

    // Content types
    expect(aliases).toContain('artikkel');
    expect(aliases).toContain('eksempel');
    expect(aliases).toContain('faq');
    expect(aliases).toContain('merkelapp');
    expect(aliases).toContain('side');
    expect(aliases).toContain('veiledning');

    // Container types (folders)
    expect(aliases).toContain('artikler');
    expect(aliases).toContain('eksempler');
    expect(aliases).toContain('faqSamling');
    expect(aliases).toContain('merkelapper');
    expect(aliases).toContain('sider');
    expect(aliases).toContain('veiledninger');
  });

  test('artikkel has tittel, slug, innhold', () => {
    const props = getPropertyAliases('artikkel');
    expect(props).toContain('tittel');
    expect(props).toContain('slug');
    expect(props).toContain('innhold');
  });

  test('eksempel has organisasjon, verktoy, resultater, status, bilde', () => {
    const props = getPropertyAliases('eksempel');
    expect(props).toContain('organisasjon');
    expect(props).toContain('verktoy');
    expect(props).toContain('resultater');
    expect(props).toContain('status');
    expect(props).toContain('bilde');
  });

  test('side has SEO properties', () => {
    const props = getPropertyAliases('side');
    expect(props).toContain('seoTittel');
    expect(props).toContain('seoBeskrivelse');
    expect(props).toContain('template');
  });

  test('veiledning has kategori and rekkefølge', () => {
    const props = getPropertyAliases('veiledning');
    expect(props).toContain('kategori');
    expect(props).toContain('rekkefolge');
    expect(props).toContain('innhold');
  });

  test('faq has sporsmal, svar, kategori', () => {
    const props = getPropertyAliases('faq');
    expect(props).toContain('sporsmal');
    expect(props).toContain('svar');
    expect(props).toContain('kategori');
  });

  test('merkelapp has navn, slug, beskrivelse', () => {
    const props = getPropertyAliases('merkelapp');
    expect(props).toContain('navn');
    expect(props).toContain('slug');
    expect(props).toContain('beskrivelse');
  });

  test('container types allow correct child types', () => {
    // Check that "artikler" container allows "artikkel" as child
    const rows = sqlRows(
      `SELECT ct.alias AS childAlias FROM cmsContentTypeAllowedContentType a
       INNER JOIN cmsContentType ct ON a.AllowedId = ct.nodeId
       INNER JOIN cmsContentType parent ON a.Id = parent.nodeId
       WHERE parent.alias = 'artikler'`
    );
    expect(rows.length).toBe(1);
    expect(rows[0][0]).toBe('artikkel');
  });
});

// ── Seeded content ──────────────────────────────────────────────

test.describe('Seeded content', () => {
  const api = `${CMS}/umbraco/delivery/api/v2/content`;

  test('4 articles are published', async ({ request }) => {
    const res = await request.get(api, {
      params: { filter: 'contentType:artikkel' },
      ignoreHTTPSErrors: true,
    });
    const { total, items } = await res.json();
    expect(total).toBe(4);

    const titles = items.map((i: any) => i.properties.tittel);
    expect(titles).toContain('Ny nasjonal strategi for kunstig intelligens');
    expect(titles).toContain(
      'Kommuner tar i bruk KI for bedre innbyggertjenester'
    );
    expect(titles).toContain(
      'EUs AI Act og konsekvenser for norsk offentlig sektor'
    );
  });

  test('2 pages are published (Om oss, Sandkasse)', async ({
    request,
  }) => {
    const res = await request.get(api, {
      params: { filter: 'contentType:side' },
      ignoreHTTPSErrors: true,
    });
    const { total, items } = await res.json();
    expect(total).toBe(2);

    const slugs = items.map((i: any) => i.properties.slug);
    expect(slugs).toContain('om-oss');
    expect(slugs).toContain('sandkasse');
  });

  test('4 examples are published', async ({ request }) => {
    const res = await request.get(api, {
      params: { filter: 'contentType:eksempel' },
      ignoreHTTPSErrors: true,
    });
    const { total, items } = await res.json();
    expect(total).toBe(4);

    const orgs = items.map((i: any) => i.properties.organisasjon);
    expect(orgs).toContain('Trondheim kommune');
    expect(orgs).toContain('Stavanger kommune');
    expect(orgs).toContain('Bergen kommune');
    expect(orgs).toContain('Digitaliseringsdirektoratet');
  });

  test('5 FAQ items are published', async ({ request }) => {
    const res = await request.get(api, {
      params: { filter: 'contentType:faq' },
      ignoreHTTPSErrors: true,
    });
    const { total, items } = await res.json();
    expect(total).toBe(5);

    const questions = items.map((i: any) => i.properties.sporsmal);
    expect(questions).toContain('Hva er kunstig intelligens?');
    expect(questions).toContain('Kan KI erstatte saksbehandlere?');
  });

  test('3 veiledninger are published', async ({ request }) => {
    const res = await request.get(api, {
      params: { filter: 'contentType:veiledning' },
      ignoreHTTPSErrors: true,
    });
    const { total, items } = await res.json();
    expect(total).toBe(3);

    const titles = items.map((i: any) => i.properties.tittel);
    expect(titles).toContain('Kom i gang med KI i din virksomhet');
    expect(titles).toContain('Ansvarlig bruk av KI');
  });

  test('8 merkelapper are published', async ({ request }) => {
    const res = await request.get(api, {
      params: { filter: 'contentType:merkelapp' },
      ignoreHTTPSErrors: true,
    });
    const { total, items } = await res.json();
    expect(total).toBe(8);

    const names = items.map((i: any) => i.properties.navn);
    expect(names).toContain('Maskinlæring');
    expect(names).toContain('Personvern');
    expect(names).toContain('Etikk');
  });

  test('examples have correct status values', async ({ request }) => {
    const res = await request.get(api, {
      params: { filter: 'contentType:eksempel' },
      ignoreHTTPSErrors: true,
    });
    const { items } = await res.json();

    const statuses = items.map((i: any) => i.properties.status);
    expect(statuses).toContain('i_drift');
    expect(statuses).toContain('pilot');
  });

  test('examples have tools (verktoy) as parseable JSON arrays', async ({
    request,
  }) => {
    const res = await request.get(api, {
      params: { filter: 'contentType:eksempel' },
      ignoreHTTPSErrors: true,
    });
    const { items } = await res.json();

    for (const item of items) {
      const tools = JSON.parse(item.properties.verktoy);
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    }
  });
});

// ── Delivery API edge cases ─────────────────────────────────────

test.describe('Delivery API edge cases', () => {
  const api = `${CMS}/umbraco/delivery/api/v2/content`;

  test('returns empty list for non-existent content type', async ({
    request,
  }) => {
    const res = await request.get(api, {
      params: { filter: 'contentType:nonExistentType' },
      ignoreHTTPSErrors: true,
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(0);
    expect(body.items).toHaveLength(0);
  });

  test('supports pagination with skip and take', async ({ request }) => {
    const [res1, res2] = await Promise.all([
      request.get(api, {
        params: { take: '1', skip: '0' },
        ignoreHTTPSErrors: true,
      }),
      request.get(api, {
        params: { take: '1', skip: '1' },
        ignoreHTTPSErrors: true,
      }),
    ]);
    const body1 = await res1.json();
    const body2 = await res2.json();

    expect(body1.items).toHaveLength(1);
    expect(body2.items).toHaveLength(1);
    expect(body1.items[0].id).not.toBe(body2.items[0].id);
  });

  test('total count is consistent across paginated requests', async ({
    request,
  }) => {
    const [res1, res2] = await Promise.all([
      request.get(api, { params: { take: '2' }, ignoreHTTPSErrors: true }),
      request.get(api, { params: { take: '50' }, ignoreHTTPSErrors: true }),
    ]);
    const body1 = await res1.json();
    const body2 = await res2.json();
    expect(body1.total).toBe(body2.total);
  });
});
