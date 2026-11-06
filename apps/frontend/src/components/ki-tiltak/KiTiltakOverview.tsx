import { useEffect, useMemo, useRef, useState } from 'react';
import { Badge, Button, Chip, Heading, Label, Pagination, Paragraph, Search, usePagination } from '@digdir/designsystemet-react';
import { FunnelIcon } from '@navikt/aksel-icons';
import {
  FILTERETIKETTER,
  FILTERGRUPPER,
  TOMT_FILTER,
  filterTiltak,
  kiTiltak,
  utenKategorier,
  type FilterGruppe,
  type KiTiltak,
  type KiTiltakFilter,
} from '../../lib/ki-tiltak';
import KiTiltakDetail, { DETAIL_DIALOG_ID } from './KiTiltakDetail';
import KiTiltakFilterPanel from './KiTiltakFilterPanel';
import KiTiltakCard from './KiTiltakCard';
import { PAGE_SIZE } from './paging';
import { lesUrlTilstand, skrivUrlTilstand } from './urlState';
import PromoBanner from './PromoBanner';
import RegisterTiltakDialog from './RegisterTiltakDialog';

interface Props {
  /** Public Turnstile key, passed on to the submission form. */
  turnstileSiteKey?: string;
}

export default function KiTiltakOverview({ turnstileSiteKey = '' }: Props) {
  const [filter, setFilterState] = useState<KiTiltakFilter>(TOMT_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [selected, setSelected] = useState<KiTiltak | null>(null);
  const [page, setPage] = useState(1);
  const countRef = useRef<HTMLParagraphElement>(null);

  // A new search or filter starts over on the first page, and does not inherit
  // the page the user was on in the previous result. Done here rather than in an
  // effect on filter, which would also reset a ?side= read from the url on load.
  const setFilter: React.Dispatch<React.SetStateAction<KiTiltakFilter>> = (next) => {
    setFilterState(next);
    setPage(1);
  };

  // Search, filters and page are kept in the url (see urlState.ts). The server
  // renders the unfiltered list, so the url is read after mount, and nothing is
  // written back until it has been read. Otherwise the first write would wipe a shared link.
  const urlRead = useRef(false);
  // A page change gets its own history entry, so back goes to the previous page.
  // Typing and filtering replace the entry, so back does not step through every keystroke.
  const pushNextUrl = useRef(false);

  // Open the drawer from ?tiltak=<id> on load, and follow the browser's back button.
  useEffect(() => {
    const syncFromUrl = () => {
      const url = new URL(window.location.href);
      const fromUrl = lesUrlTilstand(url.searchParams);
      setFilterState(fromUrl.filter);
      setPage(fromUrl.page);
      urlRead.current = true;

      const id = url.searchParams.get('tiltak');
      const found = id === null ? null : (kiTiltak.find((t) => t.id === id) ?? null);

      if (found) {
        setSelected(found);
        return;
      }

      if (id !== null) {
        // Unknown id (outdated or wrong link). Remove the parameter so it
        // does not stay in the url with a closed drawer.
        url.searchParams.delete('tiltak');
        window.history.replaceState({}, '', url);
      }

      // Closing must always start in the DOM, not by setting the open prop to
      // false. The latter skips the close() algorithm, just as an
      // onClick={onClose} button would, and leaves an invisible
      // backdrop that blocks the rest of the page. dialog.close() fires the
      // native close event, which drives closeTiltak on via onClose.
      const dialog = document.getElementById(DETAIL_DIALOG_ID);
      if (dialog instanceof HTMLDialogElement && dialog.open) {
        dialog.close();
      } else {
        setSelected(null); // no open dialog to close, for example on mount
      }
    };
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  const matches = useMemo(() => filterTiltak(kiTiltak, filter), [filter]);

  const totalPages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  // A ?side= beyond the last page (old link, fewer hits now) shows the last page.
  const currentPage = Math.min(page, totalPages);
  const visible = useMemo(
    () => matches.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE),
    [matches, currentPage],
  );

  useEffect(() => {
    if (!urlRead.current) return;
    const current = new URL(window.location.href);
    const next = skrivUrlTilstand(current, { filter, page: currentPage });
    const push = pushNextUrl.current;
    pushNextUrl.current = false;
    if (next.href === current.href) return;
    if (push) window.history.pushState({}, '', next);
    else window.history.replaceState(window.history.state, '', next);
  }, [filter, currentPage]);

  const goToPage = (next: number) => {
    if (next === currentPage) return;
    pushNextUrl.current = true;
    setPage(next);
    countRef.current?.scrollIntoView({ block: 'start' });
    countRef.current?.focus({ preventScroll: true });
  };

  // Fewer page buttons on small screens, at the same breakpoint as the rest of the site.
  const [smallScreen, setSmallScreen] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 767px)');
    const update = () => setSmallScreen(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const { pages, prevButtonProps, nextButtonProps } = usePagination({
    currentPage,
    totalPages,
    showPages: smallScreen ? 5 : 7,
    setCurrentPage: goToPage,
  });

  const activeChips = FILTERGRUPPER.flatMap((group) => filter[group].map((value) => ({ group, value })));

  const hasActiveFilter = filter.query.trim().length > 0 || activeChips.length > 0;

  const countText = hasActiveFilter
    ? `Viser ${matches.length} av ${kiTiltak.length} tiltak`
    : `${kiTiltak.length} tiltak`;

  const removeChip = (group: FilterGruppe, value: string) =>
    setFilter((previous) => ({ ...previous, [group]: previous[group].filter((v) => v !== value) }));

  const openTiltak = (tiltak: KiTiltak) => {
    const url = new URL(window.location.href);
    url.searchParams.set('tiltak', tiltak.id);
    // Tagged with the tiltak id, so closeTiltak knows that this entry
    // was added by us, and can pop it instead of adding yet another.
    window.history.pushState({ tiltak: tiltak.id }, '', url);
    setSelected(tiltak);
  };

  // The drawer always opens with pushState, so closing must balance that. If
  // the history entry has our own tiltak tag, we pop it (popstate
  // drives the rest via syncFromUrl). Without the tag we came from a shared link and
  // have no entry of our own to pop, so we clean the url in place instead.
  const closeTiltak = () => {
    if (window.history.state?.tiltak) {
      window.history.back();
      return;
    }

    const url = new URL(window.location.href);
    if (url.searchParams.has('tiltak')) {
      url.searchParams.delete('tiltak');
      window.history.replaceState({}, '', url);
    }
    setSelected(null);
  };

  return (
    <>
      <PromoBanner onRegistrer={() => setRegisterOpen(true)} />

      {/*
        Search field and filter button share a row, and the button wraps below the field when
        there is no room. Count and active filters sit on the row below.
      */}
      <div className="tiltak-sokerad">
        <div className="tiltak-sokefelt">
          <Label className="tiltak-sokelabel" htmlFor="sok-tiltak">
            Søk etter tiltak
          </Label>
          <Search>
            <Search.Input
              id="sok-tiltak"
              value={filter.query}
              onChange={(event) => setFilter((previous) => ({ ...previous, query: event.target.value }))}
            />
            <Search.Clear />
          </Search>
        </div>

        <Button
          variant="secondary"
          onClick={() => setFilterOpen(true)}
          aria-haspopup="dialog"
          className="tiltak-filterknapp"
        >
          <FunnelIcon aria-hidden />
          Filter
          {activeChips.length > 0 && <Badge count={activeChips.length} />}
        </Button>
      </div>

      <div className="tiltak-filterrad">
        <p className="tiltak-antall" aria-live="polite" ref={countRef} tabIndex={-1}>
          {countText}
        </p>

        {activeChips.map(({ group, value }) => (
          <Chip.Removable
            key={`${group}-${value}`}
            aria-label={`Fjern filter ${FILTERETIKETTER[group]}: ${value}`}
            onClick={() => removeChip(group, value)}
          >
            {/*
              The group name muted and the value emphasised, as in the prototype. The chip's
              accessible name comes from aria-label above, so the split here
              is purely visual.
            */}
            <span className="tiltak-chip-gruppe">{`${FILTERETIKETTER[group]}: `}</span>
            <strong>{value}</strong>
          </Chip.Removable>
        ))}

        {activeChips.length > 0 && (
          <Button
            variant="tertiary"
            data-size="sm"
            className="tiltak-nullstill"
            onClick={() => setFilter(utenKategorier)}
          >
            Nullstill
          </Button>
        )}
      </div>

      {matches.length > 0 ? (
        <>
          <div className="tiltak-grid">
            {visible.map((tiltak) => (
              <KiTiltakCard
                key={tiltak.id}
                tiltak={tiltak}
                query={filter.query}
                onOpen={openTiltak}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <Pagination className="tiltak-paginering" aria-label="Sider med tiltak">
              <Pagination.List>
                <Pagination.Item>
                  <Pagination.Button {...prevButtonProps} aria-label="Forrige side">
                    <span className="ds-pagination-tekst">Forrige</span>
                  </Pagination.Button>
                </Pagination.Item>
                {pages.map(({ page: pageNumber, itemKey, buttonProps }) => (
                  <Pagination.Item key={itemKey}>
                    {typeof pageNumber === 'number' && (
                      <Pagination.Button {...buttonProps} aria-label={`Side ${pageNumber}`}>
                        {pageNumber}
                      </Pagination.Button>
                    )}
                  </Pagination.Item>
                ))}
                <Pagination.Item>
                  <Pagination.Button {...nextButtonProps} aria-label="Neste side">
                    <span className="ds-pagination-tekst">Neste</span>
                  </Pagination.Button>
                </Pagination.Item>
              </Pagination.List>
            </Pagination>
          )}
        </>
      ) : (
        <div className="tiltak-tomt">
          <Heading level={2} data-size="sm" className="tiltak-tomt-tittel">
            Ingen treff på søket
          </Heading>
          <Paragraph>Prøv et annet søkeord eller endre søkefilteret.</Paragraph>
        </div>
      )}

      <KiTiltakFilterPanel
        open={filterOpen}
        onClose={() => setFilterOpen(false)}
        filter={filter}
        setFilter={setFilter}
      />

      <KiTiltakDetail tiltak={selected} onClose={closeTiltak} />

      <RegisterTiltakDialog
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        turnstileSiteKey={turnstileSiteKey}
      />
    </>
  );
}
