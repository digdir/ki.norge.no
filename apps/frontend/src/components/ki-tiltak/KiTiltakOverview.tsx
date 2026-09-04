import { useEffect, useMemo, useState } from 'react';
import { Badge, Button, Chip, Heading, Label, Paragraph, Search } from '@digdir/designsystemet-react';
import { FunnelIcon } from '@navikt/aksel-icons';
import { filterTiltak, kiTiltak, type KiTiltak, type KiTiltakFilter } from '../../lib/ki-tiltak';
import KiTiltakDetail, { DETAIL_DIALOG_ID } from './KiTiltakDetail';
import KiTiltakFilterPanel from './KiTiltakFilterPanel';
import KiTiltakCard from './KiTiltakCard';
import PromoBanner from './PromoBanner';
import RegisterTiltakDialog from './RegisterTiltakDialog';

const EMPTY_FILTER: KiTiltakFilter = { query: '', fagomrade: [], status: [] };

/* Prototypen viser 40 tiltak først og laster 20 av gangen etter det. */
const FIRST_PAGE = 40;
const NEXT_PAGE = 20;
const GROUP_LABELS = { fagomrade: 'Fag- og temaområde', status: 'Status' } as const;

interface Props {
  /** Offentlig Turnstile-nøkkel, videreført til innsendingsskjemaet. */
  turnstileSiteKey?: string;
}

export default function KiTiltakOverview({ turnstileSiteKey = '' }: Props) {
  const [filter, setFilter] = useState<KiTiltakFilter>(EMPTY_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [selected, setSelected] = useState<KiTiltak | null>(null);
  const [visibleCount, setVisibleCount] = useState(FIRST_PAGE);

  // Åpne skuffen fra ?tiltak=<id> ved lasting, og følg nettleserens tilbakeknapp.
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
        // Ukjent id (utdatert eller feil lenke). Rydd bort parameteren så den
        // ikke blir liggende i url-en med en lukket skuff.
        url.searchParams.delete('tiltak');
        window.history.replaceState({}, '', url);
      }

      // Lukking skal alltid starte i DOM-en, ikke ved å sette open-propen til
      // false. Det siste hopper over close()-algoritmen, akkurat som en
      // onClick={onClose}-knapp ville gjort, og etterlater en usynlig
      // backdrop som blokkerer resten av siden. dialog.close() fyrer det
      // native close-eventet, som driver closeTiltak videre via onClose.
      const dialog = document.getElementById(DETAIL_DIALOG_ID);
      if (dialog instanceof HTMLDialogElement && dialog.open) {
        dialog.close();
      } else {
        setSelected(null); // ingen åpen dialog å lukke, for eksempel ved montering
      }
    };
    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, []);

  const matches = useMemo(() => filterTiltak(kiTiltak, filter), [filter]);

  // Et nytt søk eller filter skal starte på nytt øverst i listen, ikke arve
  // hvor langt brukeren hadde lastet i det forrige resultatet.
  useEffect(() => {
    setVisibleCount(FIRST_PAGE);
  }, [filter]);

  const visible = useMemo(() => matches.slice(0, visibleCount), [matches, visibleCount]);

  const hasActiveFilter =
    filter.query.trim().length > 0 || filter.fagomrade.length > 0 || filter.status.length > 0;

  const countText = hasActiveFilter
    ? `Viser ${matches.length} av ${kiTiltak.length} tiltak`
    : `${kiTiltak.length} tiltak`;

  const activeChips = [
    ...filter.fagomrade.map((value) => ({ group: 'fagomrade' as const, value })),
    ...filter.status.map((value) => ({ group: 'status' as const, value })),
  ];

  const removeChip = (group: 'fagomrade' | 'status', value: string) =>
    setFilter((previous) => ({ ...previous, [group]: previous[group].filter((v) => v !== value) }));

  const openTiltak = (tiltak: KiTiltak) => {
    const url = new URL(window.location.href);
    url.searchParams.set('tiltak', tiltak.id);
    // Merket med tiltak-id-en, slik at closeTiltak vet at denne oppføringen
    // ble lagt til av oss selv, og kan poppe den i stedet for å legge til enda en.
    window.history.pushState({ tiltak: tiltak.id }, '', url);
    setSelected(tiltak);
  };

  // Skuffen åpnes alltid med pushState, så lukking må balansere det. Har
  // historikkoppføringen vårt eget tiltak-merke, popper vi den (popstate
  // driver resten via syncFromUrl). Uten merket kom vi fra en delt lenke og
  // har ingen egen oppføring å poppe, så vi rydder url-en på stedet i stedet.
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

      {/*
        Filterknapp, antall og aktive filtre ligger på én rad under søkefeltet,
        slik prototypens .filter-row gjør. Tidligere delte søkefeltet rad med
        knappen og antallet, og chipsene lå på en egen rad under.
      */}
      <div className="tiltak-filterrad">
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

        <p className="tiltak-antall" aria-live="polite">
          {countText}
        </p>

        {activeChips.map(({ group, value }) => (
          <Chip.Removable
            key={`${group}-${value}`}
            aria-label={`Fjern filter ${GROUP_LABELS[group]}: ${value}`}
            onClick={() => removeChip(group, value)}
          >
            {/*
              Gruppenavnet dempet og verdien uthevet, som i prototypen. Chipens
              tilgjengelige navn kommer fra aria-label over, så oppdelingen her
              er rent visuell.
            */}
            <span className="tiltak-chip-gruppe">{`${GROUP_LABELS[group]}: `}</span>
            <strong>{value}</strong>
          </Chip.Removable>
        ))}

        {activeChips.length > 0 && (
          <Button
            variant="tertiary"
            data-size="sm"
            className="tiltak-nullstill"
            onClick={() => setFilter((previous) => ({ ...previous, fagomrade: [], status: [] }))}
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

      <RegisterTiltakDialog
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        turnstileSiteKey={turnstileSiteKey}
      />
    </>
  );
}
