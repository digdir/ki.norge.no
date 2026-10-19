import { virksomhetTekst, type KiTiltak } from '../../lib/ki-tiltak';
import { highlight } from './highlight';

interface Props {
  tiltak: KiTiltak;
  query: string;
  onOpen: (tiltak: KiTiltak) => void;
}

/** Long names shrink in two steps, otherwise they break the card. 8 of 58 are over 62 characters. */
function lengthClass(navn: string): string {
  if (navn.length > 95) return 'is-xlong';
  if (navn.length > 62) return 'is-long';
  return '';
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
      <span id={titleId} className={`tiltak-kort-tittel ${lengthClass(tiltak.navn)}`.trim()}>
        {highlight(tiltak.navn, query)}
      </span>
      {/* All the organisations in a row, the main organisation first. Truncated with … after two lines (#806). */}
      <span id={orgId} className="tiltak-kort-virksomhet">{highlight(virksomhetTekst(tiltak), query)}</span>
      {showsDescription && (
        <span id={descId} className="tiltak-kort-beskrivelse">{highlight(tiltak.beskrivelse, query)}</span>
      )}
      <span id={topicId} className="tiltak-kort-fot">{highlight(tiltak.fagomrade, query)}</span>
    </button>
  );
}
