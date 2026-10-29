import { Button, Dialog, Heading, Paragraph, Tag } from '@digdir/designsystemet-react';
import { ArrowLeftIcon } from '@navikt/aksel-icons';
import { formatRegistered, somTekst, visValg, type KiTiltak } from '../../lib/ki-tiltak';
import { toTextBlocks, toInline } from './textBlocks';

interface Props {
  tiltak: KiTiltak | null;
  onClose: () => void;
}

export const DETAIL_DIALOG_ID = 'tiltak-detalj-dialog';

/**
 * Editorial free text from the dataset. Lines that start with a bullet
 * become a real <ul>, the rest become paragraphs. See textBlocks.ts.
 */
/**
 * Links are rendered as React elements, never as innerHTML. The text comes from
 * an open submission form, so that property is what makes it safe.
 */
function Linjetekst({ text }: { text: string }) {
  return (
    <>
      {toInline(text).map((del, i) =>
        del.kind === 'link' ? (
          <a key={`a-${i}`} href={del.href} rel="noopener noreferrer nofollow ugc" target="_blank">
            {del.text}
          </a>
        ) : (
          <span key={`t-${i}`}>{del.text}</span>
        ),
      )}
    </>
  );
}

/** Section with the values as plain text. Renders nothing when the list is empty. */
function Tekstfelt({ tittel, verdier }: { tittel: string; verdier: string[] }) {
  if (verdier.length === 0) return null;
  return (
    <section className="tiltak-detalj-felt">
      <h3 className="tiltak-detalj-merkelapp">{tittel}</h3>
      <Paragraph>{somTekst(verdier)}</Paragraph>
    </section>
  );
}

function RichText({ text }: { text: string }) {
  return (
    <>
      {toTextBlocks(text).map((block, i) => {
        if (block.kind !== 'list')
          return (
            <Paragraph key={`p-${i}`}>
              <Linjetekst text={block.text} />
            </Paragraph>
          );
        // Numbering comes from <ol>, not from the text. If the editors write
        // 1, 1, 1 it still comes out right in the view.
        const List = block.ordered ? 'ol' : 'ul';
        return (
          <List key={`list-${i}`} className="tiltak-detalj-liste">
            {block.items.map((item) => (
              <li key={item}>
                <Linjetekst text={item} />
              </li>
            ))}
          </List>
        );
      })}
    </>
  );
}

export default function KiTiltakDetail({ tiltak, onClose }: Props) {
  // Start date and end date are removed from the view. The metadata fields below
  // only apply to ki-tiltak submitted or updated via the form, and an
  // empty field is not rendered at all. The older entries therefore show
  // only description and topic, and that is intended.
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
            command/commandfor instead of onClick={onClose}, same reasoning as in
            KiTiltakFilterPanel.tsx. Closing via the open prop sets dialog.open directly and
            skips the close() algorithm, which locks the rest of the page behind an invisible
            backdrop and keeps the onClose event from firing.
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

          {tiltak.virksomheter.length > 1 ? (
            // One per line, the main organisation first (#806).
            <ul className="tiltak-detalj-virksomhet tiltak-detalj-virksomheter">
              {tiltak.virksomheter.map((navn) => (
                <li key={navn}>{navn}</li>
              ))}
            </ul>
          ) : (
            <p className="tiltak-detalj-virksomhet">{tiltak.virksomheter[0]}</p>
          )}

          {tiltak.beskrivelse.length > 0 && (
            <section className="tiltak-detalj-felt">
              <h3 className="tiltak-detalj-merkelapp">Beskrivelse</h3>
              <RichText text={tiltak.beskrivelse} />
            </section>
          )}

          <Tekstfelt tittel="Type KI" verdier={visValg(tiltak.kiType, tiltak.kiTypeAnnet)} />

          <Tekstfelt
            tittel="Hva tiltaket skal levere"
            verdier={visValg(tiltak.leveranse, tiltak.leveranseAnnet)}
          />

          <Tekstfelt tittel="Fase" verdier={tiltak.fase ? [tiltak.fase] : []} />

          {tiltak.kontaktinfo && tiltak.kontaktinfo.trim().length > 0 && (
            <section className="tiltak-detalj-felt">
              <h3 className="tiltak-detalj-merkelapp">Kontaktinformasjon</h3>
              <Paragraph>
                <a href={`mailto:${tiltak.kontaktinfo.trim()}`} className="ds-link">{tiltak.kontaktinfo.trim()}</a>
              </Paragraph>
            </section>
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
            The address is not set up by operations yet. Chosen deliberately over a
            temporary address, so the text does not have to be changed twice.
          */}
          <Paragraph className="tiltak-detalj-kontakt">
            Vil du oppdatere beskrivelsen av eller fasen til tiltaket? Ta kontakt på{' '}
            <a href="mailto:ki-tiltak@kin.norge.no" className="ds-link">ki-tiltak@kin.norge.no</a>.
          </Paragraph>

          {tiltak.registered && (
            <Paragraph className="tiltak-registered">
              Registrert <time dateTime={tiltak.registered}>{formatRegistered(tiltak.registered)}</time>
            </Paragraph>
          )}
        </Dialog.Block>
      )}
    </Dialog>
  );
}
