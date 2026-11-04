import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Chip, Heading, Label, Paragraph, Search } from '@digdir/designsystemet-react';
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
import { FIRST_PAGE, NEXT_PAGE } from './paging';
import PromoBanner from './PromoBanner';

export default function KiTiltakOverview() {
  const [filter, setFilter] = useState<KiTiltakFilter>(TOMT_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState<KiTiltak | null>(null);
  const [visibleCount, setVisibleCount] = useState(FIRST_PAGE);

  // Open the drawer from ?tiltak=<id> on load, and follow the browser's back button.
  useEffect(() => {
    const syncFromUrl = () => {
      const url = new URL(window.location.href);
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

  // A new search or filter starts over at the top of the list, and does not inherit
  // how far the user had loaded in the previous result.
  useEffect(() => {
    setVisibleCount(FIRST_PAGE);
  }, [filter]);

  const visible = useMemo(() => matches.slice(0, visibleCount), [matches, visibleCount]);

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
      <PromoBanner />

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
        <p className="tiltak-antall" aria-live="polite">
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

          {visible.length < matches.length && (
            <div className="tiltak-lastflere-rad">
              <Button
                variant="secondary"
                className="tiltak-lastflere"
                onClick={() => setVisibleCount((previous) => previous + NEXT_PAGE)}
              >
                {`Last flere tiltak (${visible.length}/${matches.length})`}
              </Button>
            </div>
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
    </>
  );
}
