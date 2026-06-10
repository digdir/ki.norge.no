# Technical Review — KI Norge

Last updated: 2026-02-13

## Technology Review

| Area | Technology | Status | Review / Improvements |
|---|---|---|---|
| **CMS** | Umbraco 17.1.0 LTS | Good | N/A — solid choice, LTS support until 2027 |
| **CMS Runtime** | .NET 10 | Good | N/A — current release, matches Umbraco 17 requirements |
| **CMS Database** | SQLite (dev) | Needs decision | SQLite works for dev and small sites. For production: only **SQL Server 2016+** is the other supported option. PostgreSQL is **not supported** by Umbraco (no plans to add it during LTS lifecycle). Evaluate whether SQLite is sufficient for prod traffic, or provision SQL Server. |
| **CMS Admin** | Umbraco Backoffice | Good | N/A — standard Umbraco admin, works correctly |
| **CMS Content Types** | 6 document types | Weak validation | Add field length limits (SEO title ≤60 chars, description ≤160), slug uniqueness constraints, regex validation on slug fields |
| **CMS Secrets** | API key + preview secret | Fixed | Credentials rotated, `appsettings.Development.json` gitignored, `.example` template created |
| **CMS Preview** | Razor → Astro redirect | Good | N/A — working headless preview flow |
| **CMS Seeder** | ContentSeeder.cs | Good | N/A — idempotent, dev-only, comprehensive |
| **Frontend Runtime** | Cloudflare Workers (Node for local dev) | Good | N/A — working well |
| **Frontend Framework** | Astro 5.16 | Good | N/A — latest major version, hybrid SSG/SSR working correctly |
| **UI Components** | React 19 | Good | N/A — used only for Designsystemet components, not over-engineered |
| **Design System** | Designsystemet 1.11 | Good | Token migration just completed. Optional: generate official theme via `theme.designsystemet.no` instead of manual `:root` overrides |
| **Icons** | Material Symbols (CDN) | OK | Consider self-hosting the icon font to eliminate external dependency and improve load time |
| **CSS** | Scoped CSS + DS tokens | Good | N/A — clean pattern, dark mode overrides eliminated |
| **Dark Mode** | CSS custom properties | Good | N/A — auto-switching via DS tokens, localStorage persistence, prefers-color-scheme respect |
| **Rendering (SSG)** | Prerendered pages | Good | N/A — correct for a content site |
| **Rendering (SSR)** | `/sok` + `/api/preview` | Good | N/A — only dynamic where needed |
| **API Client** | umbraco.ts | Needs work | No fetch timeouts, no retries, no caching. `fetchBySlug` fetches ALL items then filters client-side (O(n)). Add `AbortSignal.timeout(5000)`, retry with backoff, and server-side slug filtering |
| **SEO — Meta** | OG, Twitter Card, canonical, JSON-LD | Good | Open Graph, Twitter Card, canonical URL on all pages. JSON-LD: FAQPage, Article, WebSite+SearchAction. OG image can be added when designed. |
| **SEO — Sitemap** | @astrojs/sitemap | Good | N/A — auto-generated, referenced in robots.txt |
| **SEO — robots.txt** | Allow all + sitemap | Good | N/A |
| **Accessibility** | ARIA, skip link, focus mgmt | Excellent | N/A — skip links, aria-current, aria-expanded, Escape key handling, lang="nb" all present. Designsystemet is WCAG AA compliant |
| **Accessibility Testing** | axe-core/playwright | Good | N/A — integrated into test suite |
| **Performance — Images** | CSS background-image | **Weak** | No `<img>` tags with width/height (causes layout shift), no `loading="lazy"`, no responsive `srcset`, no image optimization. Switch to `<img>` or Astro's `<Image>` component |
| **Performance — Fonts** | Preconnect + display=swap | Good | N/A — proper preconnect to Google Fonts, swap prevents blocking |
| **Performance — JS** | Astro islands | Good | N/A — minimal client JS, most components are server-rendered |
| **Testing** | Playwright 1.44 | Good | 81 tests passing. Consider adding tests for `/sok` search results and 404 page |
| **Test Browsers** | 6 projects | Good | N/A — Chrome/Firefox/Safari + dark + mobile variants |
| **Frontend Hosting** | Cloudflare Pages | OK | No `wrangler.toml` in repo — deployment config is cloud-only. Add config to git for reproducible deploys |
| **CMS Hosting** | Azure (planned) | Not started | No Azure config, no Dockerfile, no deployment pipeline. Needs setup before production |
| **CI/CD** | None | **Missing** | No GitHub Actions or other pipeline. Add: lint, build, test, deploy workflows |
| **Monorepo** | pnpm workspace | Broken | `pnpm-workspace.yaml` points to `packages/*` which doesn't exist. Should point to `apps/frontend` |
| **README** | Root README.md | Good | Rewritten with Umbraco 17 + Node + Astro stack, correct setup steps |
| **Font** | Public Sans (Google Fonts) | Good | N/A — appropriate for government site, loaded with `display=swap` |
| **.gitignore** | Root + per-app | Mostly good | `appsettings.Development.json` with secrets is tracked — should be gitignored |

---

## Prioritized Improvement List

Tasks we can do right now, ordered by impact and urgency.

### P0 — Critical (do first)

1. ~~**Fix secrets in git**~~ — DONE. Rotated credentials, added `.gitignore` entry, created `.example` template.

2. ~~**Rewrite README.md**~~ — DONE. Full rewrite with Umbraco 17 + Node + Astro stack.

### P1 — High (significant user-facing impact)

3. ~~**Add SEO meta tags to Layout.astro**~~ — DONE. Added Open Graph, Twitter Card, canonical URL. Article pages pass `ogType="article"` and `publishedAt`.

4. ~~**Add JSON-LD structured data**~~ — DONE. FAQPage schema on `/faq`, Article schema on `/artikler/[slug]`, WebSite+SearchAction on homepage.

5. ~~**CMS-editable SEO fields**~~ — DONE. Added `seoTittel`, `seoBeskrivelse`, `seoBilde` to Artikkel, Eksempel, Veiledning, Side. Mapped in `umbraco.ts`, used in all page templates with auto-generated fallbacks. Note: existing databases need a fresh install to pick up the new content type fields.

6. **Fix image performance** — Replace CSS `background-image` patterns in ArticleCard, ExamplesGrid, and Hero with proper `<img>` tags (or Astro `<Image>`) with `width`, `height`, `loading="lazy"`, and `alt` text. Eliminates layout shift (CLS) and improves Core Web Vitals.

### P2 — Medium (developer experience / robustness)

7. **Harden umbraco.ts API client** — Add `AbortSignal.timeout(5000)` to all fetches, add retry with exponential backoff (2 attempts), optimize `fetchBySlug` to use server-side filtering instead of fetching all items. Prevents hung builds when CMS is down.

8. **Add CI/CD pipeline** — GitHub Actions workflow: install → build frontend → build CMS → run Playwright tests. Catches regressions before merge. Can add deployment steps later.

9. **Fix pnpm-workspace.yaml** — Change `packages/*` to `apps/frontend`. Currently broken — workspace doesn't match actual directory structure.

10. **Decide on production database** — Evaluate whether SQLite is sufficient for expected traffic. If not, provision SQL Server 2016+ (the only other Umbraco-supported DB). Document the decision.

### P3 — Low (nice to have)

11. **Add Playwright tests for /sok and /404** — These pages exist but aren't covered by visual regression tests. Quick wins for test coverage.

12. **Self-host Material Symbols font** — Currently loaded from Google Fonts CDN. Self-hosting removes the external dependency and the DNS lookup, slightly improving first paint.

13. **Generate official DS theme** — Use `theme.designsystemet.no` with brand color `#136dec` to generate a proper theme CSS file. Replaces manual `:root` overrides in global.css.

14. **Add content type validation** — Field length limits on SEO titles/descriptions, slug format regex, uniqueness constraints. Prevents editors from entering bad data.

15. **Add wrangler.toml** — Cloudflare Workers config in git for reproducible frontend deployments.

16. **Set up CMS hosting** — Azure Web App config, Dockerfile or deployment script for Umbraco. Required before production but not blocking development.
