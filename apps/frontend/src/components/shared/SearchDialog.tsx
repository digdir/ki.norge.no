/**
 * KI-søk dialog — modal with AI overview and search results.
 *
 * Uses @digdir/designsystemet-react Dialog + Search components.
 * Still a UI shell with dummy data for "Kunstig intelligens" —
 * actual API from Eira/Benjamin will replace the DUMMY_RESULT below.
 *
 * Opens via:
 *  - Search icon in header
 *  - Ctrl+K / Cmd+K
 *
 * Layout:
 *  - Title "Hva leter du etter eller lurer du på?"
 *  - Search input with magnifying-glass button
 *  - Shared scroll container containing:
 *      - KI-oversikt (AI overview) — collapsed by default, "Vis mer" expands
 *      - Søkeresultater (search results) — below KI-oversikt
 */
import { useEffect, useRef, useState } from 'react';
import { Search, Heading, Paragraph, Link } from '@digdir/designsystemet-react';
import { akselIcons } from '../../lib/aksel-icons';

function AkselIcon({ name, size = 24, className }: { name: string; size?: number; className?: string }) {
  const svgContent = akselIcons[name] || '';
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
      dangerouslySetInnerHTML={{ __html: svgContent }}
    />
  );
}

interface SearchResult {
  title: string;
  path: string;
  excerpt: string;
  type: string;
}

interface DummyData {
  aiOverview: string;
  aiSources: { title: string; path: string }[];
  results: SearchResult[];
}

// Dummy: try searching for "kunstig intelligens" to see everything
const DUMMY_RESULT: Record<string, DummyData> = {
  'kunstig intelligens': {
    aiOverview:
      'Kunstig intelligens (KI) er datasystemer som kan utføre oppgaver som vanligvis krever menneskelig intelligens. Dette inkluderer å forstå tekst, bilder og tale, ta beslutninger, og lære fra data. I offentlig sektor brukes KI blant annet til saksbehandling, innbyggerdialog og analyser. ' +
      'Det finnes mange typer KI: klassisk KI som løser spesifikke oppgaver, generativ KI som kan skape nytt innhold som tekst og bilder, og nyere agentiske systemer som kan utføre flertrinnsoppgaver selvstendig. ' +
      'For offentlig sektor er det særlig viktig å bruke KI på en trygg og ansvarlig måte. Dette krever at virksomheten forstår teknologien, vurderer risiko, og overholder regelverk som personvernforordningen (GDPR), forvaltningsloven og KI-forordningen. ' +
      'Veiledningen på ki.norge.no gir praktiske råd om alt fra dataforvaltning til juridiske vurderinger og tekniske anskaffelser. Gjennom KI-sandkassen kan virksomheter også teste løsninger sammen med Datatilsynet i en kontrollert setting. ' +
      'Populære temaer inkluderer bias og rettferdighet, forklarbarhet, personvern, og hvordan man måler og forbedrer datakvalitet før man trener modeller.',
    aiSources: [
      { title: 'Veiledning: Ta i bruk KI', path: '/veiledning' },
      { title: 'Om KI-sandkassen', path: '/sandkasse' },
    ],
    results: [
      { title: 'EU AI Act: Hva betyr det for norsk offentlig sektor?', path: '/artikler/eu-ai-act', excerpt: 'En gjennomgang av de viktigste kravene og hvordan de vil påvirke offentlige virksomheter.', type: 'Artikkel' },
      { title: 'Ny nasjonal strategi for kunstig intelligens', path: '/artikler/ny-strategi', excerpt: 'Regjeringen presenterer ny strategi for ansvarlig bruk av KI i offentlig sektor.', type: 'Artikkel' },
      { title: 'KI-chatbot for innbyggerdialog', path: '/eksempler/ki-chatbot-for-innbyggerdialog', excerpt: 'Kommune X bruker generativ KI til å besvare innbyggerhenvendelser 24/7.', type: 'Eksempel' },
      { title: 'Vi skal ta i bruk KI', path: '/veiledning/ta-i-bruk', excerpt: 'Veiledning for virksomheter som vil ta i bruk ferdig trent KI.', type: 'Veiledning' },
      { title: 'Slik bruker Nav kunstig intelligens til saksbehandling', path: '/artikler/nav-ki', excerpt: 'Hvordan Nav har tatt i bruk maskinlæring for å prioritere saker.', type: 'Artikkel' },
    ],
  },
};

export default function SearchDialog() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [aiExpanded, setAiExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function openDialog(initialQuery = '') {
    setOpen(true);
    setQuery(initialQuery);
    setSubmitted(initialQuery);  // auto-submit if provided
    setAiExpanded(false);
  }

  function closeDialog() {
    setOpen(false);
  }

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        if (open) closeDialog(); else openDialog();
        return;
      }
      if (e.key === 'Escape' && open) {
        closeDialog();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  // External trigger from header button or chips
  useEffect(() => {
    function handleTrigger(e: Event) {
      const customEvent = e as CustomEvent<{ query?: string }>;
      const initialQuery = customEvent.detail?.query || '';
      openDialog(initialQuery);
    }
    window.addEventListener('open-search-dialog', handleTrigger);
    return () => window.removeEventListener('open-search-dialog', handleTrigger);
  }, []);

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }, [open]);

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    // TODO: Call Eira/Benjamin API with the query
    setSubmitted(q);
    setAiExpanded(false);
  }

  if (!open) return null;

  const normalizedQuery = submitted.toLowerCase();
  const dummyMatch = DUMMY_RESULT[normalizedQuery];
  const hasResults = submitted && dummyMatch;
  const isEmpty = submitted && !dummyMatch;

  return (
    <div className="search-dialog-backdrop" onClick={(e) => {
      if (e.target === e.currentTarget) closeDialog();
    }}>
      <div className="search-dialog-container">
        <div className="search-dialog-content" role="dialog" aria-modal="true" aria-labelledby="search-dialog-title">
          {/* Close button inside the dialog, top right */}
          <button
            type="button"
            className="search-dialog-close"
            onClick={closeDialog}
            aria-label="Lukk søk"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>

          <div className="search-dialog-header">
            <Heading level={2} data-size="xs" id="search-dialog-title" className="search-dialog-title">
              Hva leter du etter eller lurer på?
            </Heading>
            <form onSubmit={handleSubmit} className="search-dialog-form">
              <Search className="search-dialog-search">
                <Search.Input
                  ref={inputRef}
                  aria-label="Søk på ki.norge.no"
                  placeholder="Hva kan vi hjelpe med"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && <Search.Clear onClick={() => { setQuery(''); setSubmitted(''); }} />}
                <button type="submit" className="search-dialog-submit" aria-label="Søk">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                  </svg>
                </button>
              </Search>
            </form>
          </div>

          {/* Scroll container shared between AI overview and search results */}
          <div className="search-dialog-scroll">
            {!submitted && (
              <div className="search-dialog-hints">
                <Paragraph data-size="sm" className="search-hint-text">
                  Prøv å søke etter &laquo;kunstig intelligens&raquo; for å se hvordan det vil fungere. Bruk <kbd>Ctrl+K</kbd> for å åpne søk raskt.
                </Paragraph>
              </div>
            )}

            {hasResults && (
              <>
                {/* KI-oversikt (AI overview) FIRST, expandable */}
                <section className="search-ai-overview" aria-label="KI-oversikt">
                  <div className="search-ai-heading-row">
                    <AkselIcon name="RobotSmile" size={24} className="search-ai-icon" />
                    <h3 className="search-section-heading">KI-oversikt</h3>
                  </div>
                  <div className={`search-ai-content ${aiExpanded ? 'expanded' : 'collapsed'}`}>
                    <Paragraph className="search-ai-text">
                      {dummyMatch.aiOverview}
                    </Paragraph>
                    {aiExpanded && (
                      <div className="search-ai-sources">
                        <p className="search-ai-sources-label">Relevante artikler:</p>
                        <ul className="search-ai-sources-list">
                          {dummyMatch.aiSources.map((s) => (
                            <li key={s.path}>
                              <a href={s.path} onClick={closeDialog}>{s.title}</a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <button type="button" className="search-ai-expand" onClick={() => setAiExpanded(!aiExpanded)}>
                    {aiExpanded ? 'Vis mindre' : 'Vis mer'}
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: aiExpanded ? 'rotate(180deg)' : '' }}>
                      <path d="m6 9 6 6 6-6"/>
                    </svg>
                  </button>
                </section>

                <hr className="search-divider" />

                {/* Search results UNDER */}
                <section className="search-results" aria-label="Søkeresultater">
                  <div className="search-results-heading-row">
                    <AkselIcon name="FileSearch" size={24} className="search-results-icon" />
                    <h3 className="search-section-heading">Søkeresultater</h3>
                  </div>
                  <ul className="search-results-list">
                    {dummyMatch.results.map((r) => (
                      <li key={r.path} className="search-result-item">
                        <a href={r.path} className="search-result-link" onClick={closeDialog}>
                          <span className="search-result-title">{r.title}</span>
                          <span className="search-result-type">({r.type})</span>
                        </a>
                        <p className="search-result-excerpt">{r.excerpt}</p>
                      </li>
                    ))}
                  </ul>
                </section>
              </>
            )}

            {isEmpty && (
              <div className="search-empty-state">
                <Paragraph data-size="sm">
                  Ingen resultater for &laquo;{submitted}&raquo;. Prøv et annet søkeord.
                </Paragraph>
                <Paragraph data-size="sm" className="search-hint-text">
                  Tips: &laquo;kunstig intelligens&raquo; har en demo med full visning.
                </Paragraph>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
