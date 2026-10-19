import { virksomhetTekst, type KiTiltak } from '../../lib/ki-tiltak';
import { highlight } from './highlight';

interface Props {
  tiltak: KiTiltak;
  query: string;
  onOpen: (tiltak: KiTiltak) => void;
}

export default function KiTiltakCard({ tiltak, query, onOpen }: Props) {
  const showsDescription = tiltak.beskrivelse.length > 0;
  const titleId = `${tiltak.id}-tittel`;
  const orgId = `${tiltak.id}-org`;
  const descId = `${tiltak.id}-beskr`;
  const topicId = `${tiltak.id}-fag`;

  return (
    <button
      type="button"
      className="tiltak-kort ds-focus"
      aria-haspopup="dialog"
      aria-labelledby={titleId}
      aria-describedby={showsDescription ? `${orgId} ${descId} ${topicId}` : `${orgId} ${topicId}`}
      onClick={() => onOpen(tiltak)}
    >
      {/* Title and organisations sit closer together than the rest of the card. */}
      <span className="tiltak-kort-hode">
        <span id={titleId} className="tiltak-kort-tittel">
          {highlight(tiltak.navn, query)}
        </span>
        {/* Alle virksomhetene etter hverandre, hovedvirksomheten først. Kuttes med … etter to linjer (#806). */}
        <span id={orgId} className="tiltak-kort-virksomhet">{highlight(virksomhetTekst(tiltak), query)}</span>
      </span>
      {showsDescription && (
        <span id={descId} className="tiltak-kort-beskrivelse">{highlight(tiltak.beskrivelse, query)}</span>
      )}
      <span id={topicId} className="tiltak-kort-fot">{highlight(tiltak.fagomrade, query)}</span>
    </button>
  );
}
