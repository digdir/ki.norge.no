import { Button, Dialog, Heading, Paragraph, Tag } from '@digdir/designsystemet-react';
import { ArrowLeftIcon } from '@navikt/aksel-icons';
import { somTekst, visValg, type KiTiltak } from '../../lib/ki-tiltak';
import { toTextBlocks, toInline } from './textBlocks';

interface Props {
  tiltak: KiTiltak | null;
  onClose: () => void;
}

export const DETAIL_DIALOG_ID = 'tiltak-detalj-dialog';

/**
 * Redaksjonell fritekst fra datasettet. Linjer som starter med et kulepunkt
 * blir en ekte <ul>, resten blir avsnitt. Se textBlocks.ts.
 */
/**
 * Lenker rendres som React-elementer, aldri som innerHTML. Teksten kommer fra
 * et åpent innsendingsskjema, så det er den egenskapen som gjør den trygg.
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

/** Seksjon med verdiene som vanlig tekst. Rendrer ingenting når lista er tom. */
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
        // Nummerering kommer fra <ol>, ikke fra teksten. Skriver redaksjonen
        // 1, 1, 1 blir den likevel riktig i visningen.
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
  // Oppstartsdato og sluttdato er tatt ut av visningen. Metadatafeltene under
  // gjelder bare tiltak som er sendt inn eller oppdatert via skjemaet, og et
  // tomt felt rendres ikke i det hele tatt. De eldre oppføringene viser derfor
  // bare beskrivelse og tema, og det er meningen.
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
                <a href={`mailto:${tiltak.kontaktinfo.trim()}`}>{tiltak.kontaktinfo.trim()}</a>
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
            Adressen er ikke satt opp hos drift ennå. Valgt bevisst framfor en
            midlertidig adresse, slik at teksten ikke må endres to ganger.
          */}
          <Paragraph className="tiltak-detalj-kontakt">
            Vil du oppdatere beskrivelsen av eller fasen til tiltaket? Ta kontakt på{' '}
            <a href="mailto:ki-tiltak@kin.norge.no">ki-tiltak@kin.norge.no</a>.
          </Paragraph>
        </Dialog.Block>
      )}
    </Dialog>
  );
}
