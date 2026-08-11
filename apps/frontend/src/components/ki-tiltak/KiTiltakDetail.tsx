import { Button, Dialog, Heading, Paragraph, Tag } from '@digdir/designsystemet-react';
import { ArrowLeftIcon } from '@navikt/aksel-icons';
import type { KiTiltak } from '../../lib/ki-tiltak';
import { toTextBlocks } from './textBlocks';

interface Props {
  tiltak: KiTiltak | null;
  onClose: () => void;
}

export const DETAIL_DIALOG_ID = 'tiltak-detalj-dialog';

/**
 * Redaksjonell fritekst fra datasettet. Linjer som starter med et kulepunkt
 * blir en ekte <ul>, resten blir avsnitt. Se textBlocks.ts.
 */
function RichText({ text }: { text: string }) {
  return (
    <>
      {toTextBlocks(text).map((block, i) => {
        if (block.kind !== 'list') return <Paragraph key={`p-${i}`}>{block.text}</Paragraph>;
        // Nummerering kommer fra <ol>, ikke fra teksten. Skriver redaksjonen
        // 1, 1, 1 blir den likevel riktig i visningen.
        const List = block.ordered ? 'ol' : 'ul';
        return (
          <List key={`list-${i}`} className="tiltak-detalj-liste">
            {block.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </List>
        );
      })}
    </>
  );
}

export default function KiTiltakDetail({ tiltak, onClose }: Props) {
  // Metafelt er tomme for de fleste tiltakene, så raden vises bare når det finnes data.
  const metaFields = tiltak
    ? ([
        ['Oppstartsdato', tiltak.oppstart],
        ['Sluttdato', tiltak.slutt],
        ['Status', tiltak.status],
      ] as const).filter(([, value]) => value.length > 0)
    : [];

  return (
    <Dialog
      id={DETAIL_DIALOG_ID}
      open={tiltak !== null}
      onClose={onClose}
      placement="right"
      closedby="any"
      closeButton={false}
      className="tiltak-panel tiltak-detalj"
      aria-labelledby="tiltak-detalj-tittel"
    >
      {tiltak && (
        <Dialog.Block className="tiltak-detalj-kropp">
          {/*
            command/commandfor i stedet for onClick={onClose}, samme begrunnelse som i
            KiTiltakFilterPanel.tsx. Å lukke via open-prop setter dialog.open direkte og
            hopper over close()-algoritmen, som låser resten av siden bak en usynlig
            backdrop og hindrer onClose-eventet i å fyre.
          */}
          <Button
            variant="tertiary"
            data-size="sm"
            command="close"
            commandfor={DETAIL_DIALOG_ID}
            className="tiltak-detalj-tilbake"
          >
            <ArrowLeftIcon aria-hidden />
            Tilbake til oversikten
          </Button>

          <Heading
            id="tiltak-detalj-tittel"
            level={2}
            data-size="lg"
            className="tiltak-detalj-tittel"
          >
            {tiltak.navn}
          </Heading>

          <p className="tiltak-detalj-virksomhet">{tiltak.virksomhet}</p>

          {tiltak.beskrivelse.length > 0 && (
            <section className="tiltak-detalj-felt">
              <h3 className="tiltak-detalj-merkelapp">Beskrivelse</h3>
              <RichText text={tiltak.beskrivelse} />
            </section>
          )}

          {tiltak.formaal.length > 0 && (
            <section className="tiltak-detalj-felt">
              <h3 className="tiltak-detalj-merkelapp">Formål og hensikt</h3>
              <RichText text={tiltak.formaal} />
            </section>
          )}

          {metaFields.length > 0 && (
            <dl className="tiltak-detalj-meta">
              {metaFields.map(([label, value]) => (
                <div key={label}>
                  <dt className="tiltak-detalj-merkelapp">{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          )}

          {tiltak.fagomrade.length > 0 && (
            <section className="tiltak-detalj-tema">
              <h3 className="tiltak-detalj-merkelapp">Tema</h3>
              <Tag variant="outline" data-size="sm">
                {tiltak.fagomrade}
              </Tag>
            </section>
          )}

          {/*
            Adressen er ikke satt opp hos drift ennå. Valgt bevisst framfor en
            midlertidig adresse, slik at teksten ikke må endres to ganger.
          */}
          <Paragraph className="tiltak-detalj-kontakt">
            Vil du oppdatere beskrivelsen av eller statusen til tiltaket? Ta kontakt på{' '}
            <a href="mailto:ki-tiltak@kin.norge.no">ki-tiltak@kin.norge.no</a>.
          </Paragraph>
        </Dialog.Block>
      )}
    </Dialog>
  );
}
