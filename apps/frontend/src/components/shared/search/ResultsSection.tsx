import { Link } from '@digdir/designsystemet-react';
import { FileSearchIcon } from '@navikt/aksel-icons';
import type { KiResult } from './types';

// Innholdstype-alias → pen merkelapp. Ukjente/stale typer (f.eks. "faq" fra
// gamle indeks-dokumenter) får ingen merkelapp; reindeksering er CMS-siden (#419).
const TYPE_LABELS: Record<string, string> = {
  artikkel: 'Artikkel',
  case: 'Eksempel',
  eksempel: 'Eksempel',
  veiledning: 'Veiledning',
  veiledningGuide: 'Veiledning',
  veiledningSteg: 'Veiledning',
  enkelVeiledning: 'Veiledning',
  stegartikkel: 'Veiledning',
  kalenderhendelse: 'Kalender',
  ordbokOppslag: 'KI-ordbok',
  sandkasse: 'Sandkasse',
  omOss: 'Om oss',
  side: 'Side',
};

function prettyUrl(url: string): string {
  return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
}

export default function ResultsSection({
  results,
  onNavigate,
}: {
  results: KiResult[];
  onNavigate?: () => void;
}) {
  if (results.length === 0) return null;
  return (
    <section className="search-results" aria-label="Søkeresultater">
      <div className="search-results-heading-row">
        <FileSearchIcon aria-hidden fontSize="1.5rem" className="search-results-icon" />
        <h3 className="search-section-heading">Søkeresultater</h3>
      </div>
      <ul className="search-results-list">
        {results.map((r) => (
          <li key={r.url} className="search-result-item">
            <p className="search-result-headline">
              <Link href={r.url} className="search-result-title" onClick={onNavigate}>
                {r.title}
              </Link>
              {TYPE_LABELS[r.type] && (
                <span className="ds-tag search-result-tag" data-color="accent" data-size="sm">
                  {TYPE_LABELS[r.type]}
                </span>
              )}
            </p>
            <p className="search-result-excerpt">{r.excerpt}</p>
            <p className="search-result-url">{prettyUrl(r.url)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
