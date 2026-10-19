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
 * The name on the left and the count right-aligned, as the prototype shows it.
 * The count used to sit inside the label as "Virksomhet (18)", which both read
 * poorly and could not be right-aligned.
 */
function optionLabel(name: string, count: number) {
  return (
    <span className="tiltak-filter-rad">
      <span>{name}</span>
      <span className="tiltak-filter-antall">
        <span className="ds-sr-only">, </span>
        {count}
      </span>
    </span>
  );
}

export default function KiTiltakFilterPanel({ open, onClose, filter, setFilter }: Props) {
  // Counts are computed against the whole dataset, not the current hits, so the numbers
  // do not shrink while the user ticks boxes.
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
          // Options without ki-tiltak are not shown, and a category with no options left
          // drops out entirely instead of standing as an empty heading.
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
          The primary button comes first, as in the registration form.

          command/commandfor instead of onClick={onClose}: a <dialog> closed by setting the
          open attribute directly (which happens when onClose only updates React state) keeps
          the "is modal" flag and stays in the top layer. The rest of the page is then invisibly
          blocked for clicks even though the drawer is no longer shown. command="close" triggers the
          real close() algorithm (native in newer browsers, polyfilled by designsystemet-web
          otherwise), which both closes correctly and fires onClose via the dialog's close event.
        */}
        <Button command="close" commandfor={FILTER_DIALOG_ID}>Vis resultater</Button>
        <Button variant="secondary" onClick={reset}>Nullstill</Button>
      </Dialog.Block>
    </Dialog>
  );
}
