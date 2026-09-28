import data from '../data/ki-tiltak.json';
import idAlias from '../data/ki-tiltak-id-alias.json';
import { finnTiltak, normaliserTiltak, sorterPaaNavn, type KiTiltak, type RaaTiltak } from './ki-tiltak-modell';

export {
  ANNET,
  FAGOMRADER,
  FASER,
  KI_TYPER,
  LEVERANSER,
  type KiTiltak,
  type KiTiltakFase,
} from './ki-tiltak-modell';

/**
 * ki-tiltak.json lages av scripts/importer-ki-tiltak.mjs fra registerets
 * eksport, og redigeres ikke for hånd. Modellen tåler likevel registerets form,
 * med tekst eller liste for virksomhet og orgnr og null hvor som helst.
 *
 * Sorteringen skjer her, ikke i JSON-filen.
 */
const rader: RaaTiltak[] = data;
export const kiTiltak: KiTiltak[] = sorterPaaNavn(rader.map(normaliserTiltak));

/** Gammel id til ny, fra tidligere importer. Gamle ?tiltak=-lenker skal fortsatt virke. */
export const kiTiltakIdAlias: Record<string, string> = idAlias;

/** ?tiltak=<id>, også med en id fra før en import. */
export function slaaOppTiltak(id: string) {
  return finnTiltak(id, kiTiltak, kiTiltakIdAlias);
}

/** «Entur AS, Ruter, Vy». Slik vises virksomhetene på kortet. */
export function virksomhetTekst(tiltak: KiTiltak): string {
  return tiltak.virksomheter.join(', ');
}

export interface KiTiltakFilter {
  query: string;
  fagomrade: string[];
}

/**
 * Fritekstsøk kombinert med fasettfiltre. Grupper er ELLER internt og OG mot
 * hverandre. Tom gruppe betyr ingen begrensning fra den gruppen.
 */
export function filterTiltak(items: KiTiltak[], filter: KiTiltakFilter): KiTiltak[] {
  const q = filter.query.trim().toLowerCase();

  return items.filter((tiltak) => {
    if (filter.fagomrade.length > 0 && !filter.fagomrade.includes(tiltak.fagomrade)) return false;
    if (q.length === 0) return true;

    const haystack = [
      tiltak.navn,
      ...tiltak.virksomheter,
      tiltak.beskrivelse,
      tiltak.fagomrade,
      tiltak.fase ?? '',
    ]
      .join(' ')
      .toLowerCase();

    return haystack.includes(q);
  });
}

/**
 * Slår sammen et flervalg med tilhørende «Annet»-fritekst til det som skal vises.
 *
 * Skjemaet lagrer valget «Annet» og friteksten hver for seg. Å vise begge gir
 * «Annet, chatbot for innbyggere», der første ledd ikke sier leseren noe. Her
 * erstatter friteksten ordet, på plassen ordet hadde, så rekkefølgen redaktøren
 * valgte beholdes. Mangler friteksten, faller vi tilbake til «Annet», som i det
 * minste er ærlig om at det finnes noe utenfor lista.
 */
export function visValg(valg?: string[], annet?: string): string[] {
  if (!valg || valg.length === 0) return [];
  const fritekst = annet?.trim();
  return valg
    .map((v) => (v === 'Annet' && fritekst ? fritekst : v))
    .filter((v) => v.trim().length > 0);
}

const listeformat = new Intl.ListFormat('nb', { style: 'long', type: 'conjunction' });

/** «Generativ KI, Prediktiv KI og Språkteknologi». Slik vises flervalgene i detaljvisningen. */
export function somTekst(verdier: string[]): string {
  return listeformat.format(verdier);
}
