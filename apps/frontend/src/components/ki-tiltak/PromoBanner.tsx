import { Button, Heading, Paragraph } from '@digdir/designsystemet-react';

interface Props {
  onRegistrer: () => void;
}

export default function PromoBanner({ onRegistrer }: Props) {
  return (
    <div className="tiltak-promo">
      <div className="tiltak-promo-tekst">
        <Heading level={2} data-size="xs" className="tiltak-promo-tittel">
          Vil du dele et offentlig KI-tiltak?
        </Heading>
        <Paragraph data-size="sm">
          Det kan være en pilot, løsning eller pågående prosjekt.
        </Paragraph>
      </div>

      <Button onClick={onRegistrer} aria-haspopup="dialog" className="tiltak-promo-knapp">
        Del KI-tiltak
      </Button>
    </div>
  );
}
