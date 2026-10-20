import { Button, Heading, Paragraph } from '@digdir/designsystemet-react';

export default function PromoBanner() {
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

      <Button asChild className="tiltak-promo-knapp">
        <a href="/ki-tiltak/del">Del KI-tiltak</a>
      </Button>
    </div>
  );
}
