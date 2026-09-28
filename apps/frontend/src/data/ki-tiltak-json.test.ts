import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { finnJsonFeil, utdrag } from '../lib/json-feil';

/**
 * Leser ki-tiltak.json som tekst, ikke som import. Med en syntaksfeil i fila
 * feiler alt som importerer den, med en kort engelsk melding uten linjenummer.
 * Denne fila feiler for seg, med linje, utdrag og hva som pleier å være galt.
 */
const FIL = fileURLToPath(new URL('./ki-tiltak.json', import.meta.url));
const STI_I_REPO = 'apps/frontend/src/data/ki-tiltak.json';
const tekst = readFileSync(FIL, 'utf-8');

/** Felt som ikke lenger hører hjemme i fila. Står de der, vises de ikke, og de blir liggende. */
const FJERNEDE_FELT: Record<string, string> = {
  status: 'er fjernet. Bruk fase for nye tiltak',
  formaal: 'sto i en eldre veiledning, men har aldri vært i bruk på nettstedet',
  oppstart: 'sto i en eldre veiledning, men har aldri vært i bruk på nettstedet',
  slutt: 'sto i en eldre veiledning, men har aldri vært i bruk på nettstedet',
};

/**
 * I GitHub Actions blir en linje som starter med ::error til en merknad på
 * riktig linje i fila, også i PR-visningen. Uten den må feilen letes fram i loggen.
 */
function merknad(linje: number, kolonne: number, tittel: string, melding: string) {
  if (process.env.GITHUB_ACTIONS !== 'true') return;
  const rens = (s: string) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  // Vitest skriver fargekoder foran konsollutskrift. Da starter ikke linja med
  // ::error, og GitHub overser den. Linjeskiftet først gir merknaden egen linje.
  console.log(`\n::error file=${STI_I_REPO},line=${linje},col=${kolonne},title=${rens(tittel)}::${rens(melding)}`);
}

function linjeFor(indeks: number): number {
  return tekst.slice(0, indeks).split('\n').length;
}

describe('ki-tiltak.json', () => {
  test('er gyldig JSON', () => {
    const feil = finnJsonFeil(tekst);
    if (feil) {
      merknad(feil.linje, feil.kolonne, 'Syntaksfeil i ki-tiltak.json', feil.forklaring);
      expect.fail(
        `ki-tiltak.json har en syntaksfeil på linje ${feil.linje}, kolonne ${feil.kolonne}.\n\n` +
          `${utdrag(tekst, feil)}\n\n${feil.forklaring}`,
      );
    }
  });

  test('bruker ingen felt som er fjernet', () => {
    if (finnJsonFeil(tekst)) return; // syntaksfeilen over er det som må rettes først
    const funn: string[] = [];
    for (const [felt, grunn] of Object.entries(FJERNEDE_FELT)) {
      for (const treff of tekst.matchAll(new RegExp(`"${felt}"\\s*:`, 'g'))) {
        const linje = linjeFor(treff.index);
        merknad(linje, 1, `Fjernet felt: ${felt}`, `«${felt}» ${grunn}. Slett linja.`);
        funn.push(`linje ${linje}: «${felt}» ${grunn}.`);
      }
    }
    if (funn.length > 0) expect.fail(`Slett disse linjene fra ki-tiltak.json:\n${funn.join('\n')}`);
  });
});
