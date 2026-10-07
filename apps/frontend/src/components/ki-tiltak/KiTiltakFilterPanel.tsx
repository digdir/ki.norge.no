import { useMemo } from 'react';
import { Button, Checkbox, Dialog, Fieldset, Heading } from '@digdir/designsystemet-react';
import {
  FILTERETIKETTER,
  FILTERGRUPPER,
  FILTERVALG,
  kiTiltak,
  tellFiltervalg,
  utenKategorier,
  type FilterGruppe,
  type KiTiltakFilter,
} from '../../lib/ki-tiltak';

interface Props {
  open: boolean;
  onClose: () => void;
  filter: KiTiltakFilter;
  setFilter: React.Dispatch<React.SetStateAction<KiTiltakFilter>>;
}

const FILTER_DIALOG_ID = 'tiltak-filter-dialog';

/**
 * Navnet til venstre og antallet høyrestilt, slik prototypen viser det.
 * Tidligere lå antallet inne i etiketten som «Virksomhet (18)», som både leste
 * dårlig og ikke lot seg høyrestille.
 */
function optionLabel(name: string, count: number) {
  return (
    <span className="tiltak-filter-rad">
      <span>{name}</span>
      <span className="tiltak-filter-antall">{count}</span>
    </span>
  );
}

export default function KiTiltakFilterPanel({ open, onClose, filter, setFilter }: Props) {
  // Antall regnes mot hele datasettet, ikke mot gjeldende treff, så tallene
  // ikke krymper mens brukeren huker av.
  const count = useMemo(() => tellFiltervalg(kiTiltak), []);

  const toggle = (group: FilterGruppe, value: string) => {
    setFilter((previous) => {
      const selected = previous[group];
      return {
        ...previous,
        [group]: selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value],
      };
    });
  };

  const reset = () => setFilter(utenKategorier);

  return (
    <Dialog
      id={FILTER_DIALOG_ID}
      open={open}
      onClose={onClose}
      placement="right"
      closedby="any"
      className="tiltak-panel"
      aria-labelledby="tiltak-filter-tittel"
    >
      <Dialog.Block>
        <Heading id="tiltak-filter-tittel" level={2} data-size="sm" className="tiltak-panel-tittel">
          Filter
        </Heading>
      </Dialog.Block>

      <Dialog.Block className="tiltak-panel-kropp">
        {FILTERGRUPPER.map((gruppe) => {
          // Valg uten tiltak vises ikke, og en kategori uten noen valg igjen
          // faller bort helt i stedet for å stå som en tom overskrift.
          const valg = FILTERVALG[gruppe].filter((v) => (count[gruppe].get(v) ?? 0) > 0);
          if (valg.length === 0) return null;
          return (
            <Fieldset key={gruppe}>
              <Fieldset.Legend>{FILTERETIKETTER[gruppe]}</Fieldset.Legend>
              {valg.map((verdi) => (
                <Checkbox
                  key={verdi}
                  label={optionLabel(verdi, count[gruppe].get(verdi) ?? 0)}
                  value={verdi}
                  checked={filter[gruppe].includes(verdi)}
                  onChange={() => toggle(gruppe, verdi)}
                />
              ))}
            </Fieldset>
          );
        })}
      </Dialog.Block>

      <Dialog.Block className="tiltak-panel-fot">
        {/*
          Primærknappen står først, som i registreringsskjemaet.

          command/commandfor i stedet for onClick={onClose}: en <dialog> lukket ved å sette
          open-attributtet direkte (som skjer når onClose bare oppdaterer React-state) beholder
          "is modal"-flagget og blir liggende i topplaget. Resten av siden blir da usynlig
          blokkert for klikk selv om skuffen ikke lenger vises. command="close" trigger den
          ekte close()-algoritmen (native i nyere nettlesere, polyfillet av designsystemet-web
          ellers), som både lukker riktig og fyrer onClose via dialogens close-event.
        */}
        <Button command="close" commandfor={FILTER_DIALOG_ID}>Vis resultater</Button>
        <Button variant="secondary" onClick={reset}>Nullstill</Button>
      </Dialog.Block>
    </Dialog>
  );
}
