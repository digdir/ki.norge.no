// Formene bildene vises i, samlet ett sted. Hver plassering bruker ett format
// med samme form på alle skjermbredder, så bildeserveren lager utsnittet og CSS
// aldri kutter mer. Endres en form her, følger alle plasseringene med.
//
// Navnene blir også navnene på utsnittene i Umbraco når de kommer (#131).
// Bredder er kandidatene i srcset, og den største dekker plasseringen på en
// skarp skjerm. Fila importerer ingenting, så layouttesten kan lese den.

export const BILDEFORMATER = {
  kort: { form: [4, 3], bredder: [400, 600, 800, 1200] },
  bred: { form: [16, 9], bredder: [600, 900, 1200, 1600] },
  topp: { form: [3, 2], bredder: [800, 1200, 1600, 2000] },
  // Sandkassen beholder 2:1 til designeren har bestemt seg.
  sandkasse: { form: [2, 1], bredder: [800, 1200, 1600, 2000] },
  deling: { form: [1200, 630], bredder: [1200] },
} as const satisfies Record<string, { form: readonly [number, number]; bredder: readonly number[] }>;

export type Bildeformat = keyof typeof BILDEFORMATER;

export function hoydeFor(format: Bildeformat, bredde: number): number {
  const [b, h] = BILDEFORMATER[format].form;
  return Math.round((bredde * h) / b);
}

// Bilder uten format, som i innholdet og illustrasjoner, vises i sin egen form.
export const UTEN_FORMAT_BREDDER = [400, 800, 1200, 1600] as const;
