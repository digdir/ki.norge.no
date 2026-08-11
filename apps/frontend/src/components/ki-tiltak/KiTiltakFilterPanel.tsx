import { useMemo } from 'react';
import { Button, Checkbox, Dialog, Fieldset, Heading } from '@digdir/designsystemet-react';
import { FAGOMRADER, STATUSES, kiTiltak, type KiTiltakFilter } from '../../lib/ki-tiltak';

interface Props {
  open: boolean;
  onClose: () => void;
  filter: KiTiltakFilter;
  setFilter: React.Dispatch<React.SetStateAction<KiTiltakFilter>>;
}

type Group = 'fagomrade' | 'status';

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
  const count = useMemo(() => {
    const fagomrade = new Map<string, number>();
    const status = new Map<string, number>();
    for (const tiltak of kiTiltak) {
      fagomrade.set(tiltak.fagomrade, (fagomrade.get(tiltak.fagomrade) ?? 0) + 1);
      if (tiltak.status !== '') status.set(tiltak.status, (status.get(tiltak.status) ?? 0) + 1);
    }
    return { fagomrade, status };
  }, []);

  const toggle = (group: Group, value: string) => {
    setFilter((previous) => {
      const selected = previous[group];
      return {
        ...previous,
        [group]: selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value],
      };
    });
  };

  const reset = () => setFilter((previous) => ({ ...previous, fagomrade: [], status: [] }));

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
        <Fieldset>
          <Fieldset.Legend>Fag- og temaområde</Fieldset.Legend>
          {FAGOMRADER.filter((f) => (count.fagomrade.get(f) ?? 0) > 0).map((fagomrade) => (
            <Checkbox
              key={fagomrade}
              label={optionLabel(fagomrade, count.fagomrade.get(fagomrade) ?? 0)}
              value={fagomrade}
              checked={filter.fagomrade.includes(fagomrade)}
              onChange={() => toggle('fagomrade', fagomrade)}
            />
          ))}
        </Fieldset>

        <Fieldset>
          <Fieldset.Legend>Status</Fieldset.Legend>
          <Fieldset.Description>
            Status er registrert for noen av tiltakene.
          </Fieldset.Description>
          {STATUSES.filter((s) => (count.status.get(s) ?? 0) > 0).map((status) => (
            <Checkbox
              key={status}
              label={optionLabel(status, count.status.get(status) ?? 0)}
              value={status}
              checked={filter.status.includes(status)}
              onChange={() => toggle('status', status)}
            />
          ))}
        </Fieldset>
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
