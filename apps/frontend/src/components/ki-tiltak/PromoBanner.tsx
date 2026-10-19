import { Button, Heading, Paragraph } from '@digdir/designsystemet-react';

interface Props {
  onRegistrer: () => void;
}

/** Decorative share glyph from the design prototype. Aksel has no share icon. */
function ShareIcon() {
  return (
    <svg
      className="tiltak-promo-ikon"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="6" cy="12" r="2.6" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="18" cy="6" r="2.6" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="18" cy="18" r="2.6" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8.3 10.8l7.4-3.6M8.3 13.2l7.4 3.6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export default function PromoBanner({ onRegistrer }: Props) {
  return (
    <div className="tiltak-promo">
      <ShareIcon />

      <div className="tiltak-promo-tekst">
        <Heading level={2} data-size="xs" className="tiltak-promo-tittel">
          Vil du dele et offentlig KI-tiltak?
        </Heading>
        <Paragraph data-size="md">
          Det kan være en pilot, løsning eller pågående prosjekt.
        </Paragraph>
      </div>

      <Button onClick={onRegistrer} aria-haspopup="dialog" className="tiltak-promo-knapp">
        Del KI-tiltak
      </Button>
    </div>
  );
}
