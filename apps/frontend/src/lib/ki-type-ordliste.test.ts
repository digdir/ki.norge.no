import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { KI_TYPER, ANNET } from './ki-tiltak';

// Type KI på eksempler er en avkrysningsliste i CMS-et, og skal bruke de samme
// ordene som ki-tiltak. Da har nettstedet én liste for samme ting, ikke to.
// «Annet» er utelatt, fordi det ikke sier noe som merkelapp.
const kiTypeConfig = fileURLToPath(
  new URL('../../../cms-umbraco/uSync/v17/DataTypes/KIType.config', import.meta.url),
);

function valgIDatatypen(xml: string): string[] {
  const config = xml.match(/<Config><!\[CDATA\[([\s\S]*?)\]\]><\/Config>/)?.[1];
  return JSON.parse(config ?? '{}').items ?? [];
}

describe('KI-type-datatypen i CMS-et', () => {
  it('har ordene fra KI_TYPER, i samme rekkefølge, uten Annet', () => {
    expect(valgIDatatypen(readFileSync(kiTypeConfig, 'utf-8'))).toEqual(KI_TYPER.filter((t) => t !== ANNET));
  });
});
