/**
 * Finner den første syntaksfeilen i en JSON-tekst, med linje, kolonne og en
 * forklaring på norsk.
 *
 * JSON.parse sier hvor feilen er for de fleste feil, men ikke for den
 * vanligste: et komma etter siste element gir bare «Unexpected token ']'».
 * Denne leseren går gjennom teksten selv og vet derfor alltid hvor den er, og
 * hva den ventet å finne. Den godtar nøyaktig det JSON.parse godtar.
 */

export interface JsonFeil {
  /** 1-basert */
  linje: number;
  /** 1-basert */
  kolonne: number;
  forklaring: string;
}

class Stopp extends Error {
  constructor(
    readonly indeks: number,
    readonly forklaring: string,
  ) {
    super(forklaring);
  }
}

const TYPOGRAFISKE = '“”„‟«»';

export function finnJsonFeil(tekst: string): JsonFeil | null {
  let i = 0;

  const stopp = (indeks: number, forklaring: string): never => {
    throw new Stopp(indeks, forklaring);
  };

  const hoppOverMellomrom = () => {
    while (i < tekst.length && ' \t\n\r'.includes(tekst[i])) i++;
  };

  const tekstverdi = () => {
    const start = i;
    i++; // "
    while (i < tekst.length) {
      const c = tekst[i];
      if (c === '"') {
        i++;
        return;
      }
      if (c === '\\') {
        const neste = tekst[i + 1];
        if (neste === 'u' && /^[0-9a-fA-F]{4}$/.test(tekst.slice(i + 2, i + 6))) i += 6;
        else if (neste !== undefined && '"\\/bfnrt'.includes(neste)) i += 2;
        else stopp(i, 'Ugyldig \\ i teksten. Skal det stå en skråstrek, skriv \\\\.');
        continue;
      }
      if (c === '\n' || c === '\r') stopp(i, 'Linjeskift inne i en tekst. Skriv \\n der det skal være nytt avsnitt, og hold teksten på én linje.');
      if (c.charCodeAt(0) < 0x20) stopp(i, 'Et usynlig kontrolltegn inne i teksten, ofte fra innliming fra Word. Skriv teksten inn på nytt.');
      i++;
    }
    stopp(start, 'Teksten som starter her blir aldri avsluttet med ".');
  };

  const tall = () => {
    const treff = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(tekst.slice(i));
    if (!treff) stopp(i, 'Her ventet jeg en verdi, for eksempel en tekst i "anførselstegn".');
    i += treff![0].length;
  };

  const verdi = (): void => {
    hoppOverMellomrom();
    const c = tekst[i];
    if (c === undefined) stopp(i, 'Fila slutter midt i. Sjekk at alle { og [ er lukket med } og ].');
    if (c === '{') return objekt();
    if (c === '[') return liste();
    if (c === '"') return tekstverdi();
    if (c === '-' || (c >= '0' && c <= '9')) return tall();
    for (const ord of ['true', 'false', 'null']) {
      if (tekst.startsWith(ord, i)) {
        i += ord.length;
        return;
      }
    }
    if (TYPOGRAFISKE.includes(c)) stopp(i, `Tegnet ${c} er ikke et JSON-anførselstegn. Bruk " rundt verdier.`);
    stopp(i, 'Her ventet jeg en verdi, for eksempel en tekst i "anførselstegn".');
  };

  const objekt = () => {
    i++; // {
    hoppOverMellomrom();
    if (tekst[i] === '}') {
      i++;
      return;
    }
    for (;;) {
      hoppOverMellomrom();
      const c = tekst[i];
      if (c === undefined) stopp(i, 'Fila slutter før tiltaket er lukket med }.');
      if (c !== '"') {
        if (TYPOGRAFISKE.includes(c)) stopp(i, `Tegnet ${c} er ikke et JSON-anførselstegn. Bruk " rundt feltnavn.`);
        stopp(i, 'Her ventet jeg et feltnavn i "anførselstegn".');
      }
      tekstverdi();
      hoppOverMellomrom();
      if (tekst[i] !== ':') stopp(i, 'Det mangler : mellom feltnavnet og verdien.');
      i++;
      verdi();
      const slutt = i;
      hoppOverMellomrom();
      const etter = tekst[i];
      if (etter === '}') {
        i++;
        return;
      }
      if (etter === ',') {
        const komma = i;
        i++;
        hoppOverMellomrom();
        if (tekst[i] === '}') stopp(komma, 'Et komma for mye. Etter siste felt i et tiltak skal det ikke stå komma.');
        continue;
      }
      if (etter === undefined) stopp(i, 'Fila slutter før tiltaket er lukket med }.');
      if (etter === '"') stopp(slutt, 'Det mangler et komma mellom to felt. Sett inn , her.');
      if (tekst[slutt - 1] === '"') {
        stopp(slutt - 1, 'Et " inne i teksten avslutter den for tidlig. Skriv \\" der det skal stå et anførselstegn, eller bruk « ».');
      }
      stopp(slutt, 'Her ventet jeg , eller }.');
    }
  };

  const liste = () => {
    i++; // [
    hoppOverMellomrom();
    if (tekst[i] === ']') {
      i++;
      return;
    }
    for (;;) {
      hoppOverMellomrom();
      const start = i;
      if (tekst[i] === '"') {
        tekstverdi();
        hoppOverMellomrom();
        if (tekst[i] === ':') stopp(start, 'Det mangler { foran dette feltet. Hvert tiltak starter med { og slutter med }.');
        i = start;
      }
      verdi();
      const slutt = i;
      hoppOverMellomrom();
      const etter = tekst[i];
      if (etter === ']') {
        i++;
        return;
      }
      if (etter === ',') {
        const komma = i;
        i++;
        hoppOverMellomrom();
        if (tekst[i] === ']') stopp(komma, 'Et komma for mye. Etter siste tiltak i lista skal det ikke stå komma.');
        continue;
      }
      if (etter === undefined) stopp(i, 'Fila slutter før lista er lukket med ].');
      if (etter === '{') stopp(slutt, 'Det mangler et komma mellom to tiltak. Sett inn , rett etter }.');
      if (etter === '"') stopp(slutt, 'Det mangler et komma her, eller en { foran feltet under.');
      stopp(slutt, 'Her ventet jeg , eller ].');
    }
  };

  try {
    if (tekst.charCodeAt(0) === 0xfeff) stopp(0, 'Fila starter med et usynlig tegn (BOM), ofte fra Word eller Notepad. Lagre fila som vanlig UTF-8.');
    hoppOverMellomrom();
    if (i === tekst.length) stopp(i, 'Fila er tom.');
    verdi();
    hoppOverMellomrom();
    if (i < tekst.length) stopp(i, 'Det står noe etter at lista er lukket med ].');
    return null;
  } catch (e) {
    if (!(e instanceof Stopp)) throw e;
    const foran = tekst.slice(0, e.indeks);
    const linje = foran.split('\n').length;
    const kolonne = e.indeks - (foran.lastIndexOf('\n') + 1) + 1;
    return { linje, kolonne, forklaring: e.forklaring };
  }
}

/** Linjene rundt feilen, med pil på linja og ^ under kolonnen. */
export function utdrag(tekst: string, feil: JsonFeil, foran = 2, etter = 1): string {
  const linjer = tekst.split('\n');
  const fra = Math.max(1, feil.linje - foran);
  const til = Math.min(linjer.length, feil.linje + etter);
  const bredde = String(til).length;
  const ut: string[] = [];
  for (let n = fra; n <= til; n++) {
    const merke = n === feil.linje ? '>' : ' ';
    ut.push(`${merke} ${String(n).padStart(bredde)} | ${linjer[n - 1]}`);
    if (n === feil.linje) ut.push(`  ${' '.repeat(bredde)} | ${' '.repeat(feil.kolonne - 1)}^`);
  }
  return ut.join('\n');
}
