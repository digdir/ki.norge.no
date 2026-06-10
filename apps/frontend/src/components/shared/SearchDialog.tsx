/**
 * KI-søk dialog — modal search box over ki.norge.no.
 *
 * Vanlig søk → ranked hybrid results (BM25 + dense + jina rerank) from the
 * ki-content index via POST /api/search. Opens via the header search button or
 * Ctrl/Cmd+K; the `open-search-dialog` event may carry an initial `{ query }`.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, Paragraph, Search, Heading } from '@digdir/designsystemet-react';
import { MagnifyingGlassIcon } from '@navikt/aksel-icons';
import ResultsSection from './search/ResultsSection';
import type { KiResult } from './search/types';

export default function SearchDialog() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<KiResult[]>([]);

  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const resetOutputs = useCallback(() => {
    setSubmitted(false);
    setResults([]);
    setError('');
  }, []);

  const closeDialog = useCallback(() => {
    abortRef.current?.abort();
    setOpen(false);
  }, []);

  const runSubmit = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setError('');
    setBusy(true);
    setSubmitted(true);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`Søk feilet (${res.status})`);
      const data = (await res.json()) as { results?: KiResult[] };
      setResults(data.results ?? []);
    } catch {
      if (!controller.signal.aborted) setError('Noe gikk galt. Prøv igjen.');
    } finally {
      if (abortRef.current === controller) setBusy(false);
    }
  }, []);

  const openDialog = useCallback(
    (initialQuery = '') => {
      setOpen(true);
      resetOutputs();
      setQuery(initialQuery);
      if (initialQuery) void runSubmit(initialQuery);
    },
    [resetOutputs, runSubmit],
  );

  // Ctrl/Cmd+K toggles, Esc closes.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // External trigger (header button): detail may carry an initial query.
  useEffect(() => {
    function onTrigger(e: Event) {
      const detail = (e as CustomEvent<{ query?: string }>).detail ?? {};
      openDialog(detail.query ?? '');
    }
    window.addEventListener('open-search-dialog', onTrigger);
    return () => window.removeEventListener('open-search-dialog', onTrigger);
  }, [openDialog]);

  // Focus the input while open; abort in-flight on close.
  useEffect(() => {
    if (open) {
      const t = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
    abortRef.current?.abort();
  }, [open]);

  return (
    <Dialog
      open={open}
      onClose={closeDialog}
      closedby="any"
      className="search-dialog"
      data-color="accent"
    >
      <Dialog.Block className="search-dialog-header">
        <Heading level={2} data-size="xs" className="search-dialog-title">
          Hva leter du etter?
        </Heading>
        <form
          className="search-dialog-form"
          onSubmit={(e) => {
            e.preventDefault();
            void runSubmit(query);
          }}
        >
          <Search className="search-dialog-search">
            <Search.Input
              ref={inputRef}
              aria-label="Søk på ki.norge.no"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              // @ts-expect-error autofocus is not in React's type definitions
              autofocus=""
            />
            {query && <Search.Clear onClick={() => setQuery('')} />}
            <button type="submit" className="search-dialog-submit" aria-label="Søk" disabled={busy}>
              <MagnifyingGlassIcon aria-hidden fontSize="1.375rem" />
            </button>
          </Search>
        </form>
      </Dialog.Block>

      <Dialog.Block className="search-dialog-scroll">
        {error && (
          <Paragraph data-size="md" className="search-error">
            {error}
          </Paragraph>
        )}

        {!submitted ? null : busy && results.length === 0 ? (
          <div className="search-dialog-hints">
            <Paragraph data-size="md" className="search-hint-text">
              Søker …
            </Paragraph>
          </div>
        ) : results.length > 0 ? (
          <ResultsSection results={results} onNavigate={closeDialog} />
        ) : (
          <div className="search-empty-state">
            <Paragraph data-size="md">Ingen resultater for «{query}». Prøv et annet søkeord.</Paragraph>
          </div>
        )}
      </Dialog.Block>
    </Dialog>
  );
}
