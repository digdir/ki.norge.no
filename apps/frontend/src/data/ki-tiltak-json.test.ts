import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { finnJsonFeil, utdrag } from '../lib/json-feil';

/**
 * Reads ki-tiltak.json as text, not as an import. With a syntax error in the file,
 * everything that imports it fails, with a short English message without a line number.
 * This file fails on its own, with the line, an excerpt and what usually goes wrong.
 */
const FIL = fileURLToPath(new URL('./ki-tiltak.json', import.meta.url));
const STI_I_REPO = 'apps/frontend/src/data/ki-tiltak.json';
const tekst = readFileSync(FIL, 'utf-8');

/** Fields that no longer belong in the file. If they are there, they are not shown, and they stay put. */
const FJERNEDE_FELT: Record<string, string> = {
  status: 'er fjernet. Bruk fase for nye tiltak',
  formaal: 'sto i en eldre veiledning, men har aldri vært i bruk på nettstedet',
  oppstart: 'sto i en eldre veiledning, men har aldri vært i bruk på nettstedet',
  slutt: 'sto i en eldre veiledning, men har aldri vært i bruk på nettstedet',
};

/**
 * In GitHub Actions a line starting with ::error becomes an annotation on the
 * right line in the file, also in the PR view. Without it the error has to be dug out of the log.
 */
function merknad(linje: number, kolonne: number, tittel: string, melding: string) {
  if (process.env.GITHUB_ACTIONS !== 'true') return;
  const rens = (s: string) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  // Vitest writes color codes before console output. Then the line doesn't start with
  // ::error, and GitHub ignores it. The leading newline gives the annotation its own line.
  console.log(`\n::error file=${STI_I_REPO},line=${linje},col=${kolonne},title=${rens(tittel)}::${rens(melding)}`);
}

function linjeFor(indeks: number): number {
  return tekst.slice(0, indeks).split('\n').length;
}

describe('ki-tiltak.json', () => {
  test('is valid JSON', () => {
    const feil = finnJsonFeil(tekst);
    if (feil) {
      merknad(feil.linje, feil.kolonne, 'Syntaksfeil i ki-tiltak.json', feil.forklaring);
      expect.fail(
        `ki-tiltak.json har en syntaksfeil på linje ${feil.linje}, kolonne ${feil.kolonne}.\n\n` +
          `${utdrag(tekst, feil)}\n\n${feil.forklaring}`,
      );
    }
  });

  test('uses no removed fields', () => {
    if (finnJsonFeil(tekst)) return; // the syntax error above is what must be fixed first
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
