import type { KiTiltak } from '../../lib/ki-tiltak';
import { highlight } from './highlight';

interface Props {
  tiltak: KiTiltak;
  query: string;
  onOpen: (tiltak: KiTiltak) => void;
}

/** Lange navn krymper i to trinn, ellers sprenger de kortet. 8 av 58 er over 62 tegn. */
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
      className="tiltak-kort"
      aria-haspopup="dialog"
      aria-labelledby={titleId}
      aria-describedby={showsDescription ? `${orgId} ${descId} ${topicId}` : `${orgId} ${topicId}`}
      onClick={() => onOpen(tiltak)}
    >
      <span id={titleId} className={`tiltak-kort-tittel ${lengthClass(tiltak.navn)}`.trim()}>
        {highlight(tiltak.navn, query)}
      </span>
      <span id={orgId} className="tiltak-kort-virksomhet">{highlight(tiltak.virksomhet, query)}</span>
      {showsDescription && (
        <span id={descId} className="tiltak-kort-beskrivelse">{highlight(tiltak.beskrivelse, query)}</span>
      )}
      <span id={topicId} className="tiltak-kort-fot">{highlight(tiltak.fagomrade, query)}</span>
    </button>
  );
}
