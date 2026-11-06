export function sideNummer(verdi: string | null, antallSider: number): number {
  const tall = Number.parseInt(verdi ?? '', 10);
  if (!Number.isFinite(tall) || tall < 1) return 1;
  return Math.min(tall, antallSider);
}

export function sideUtvalg(gjeldende: number, antallSider: number, antall = 7): Array<number | null> {
  if (antallSider <= antall) return Array.from({ length: antallSider }, (_, i) => i + 1);

  const kant = antall - 2; // items next to the first or last page when only one ellipsis is shown
  if (gjeldende <= kant - 1) {
    return [...Array.from({ length: kant }, (_, i) => i + 1), null, antallSider];
  }
  if (gjeldende >= antallSider - kant + 2) {
    return [1, null, ...Array.from({ length: kant }, (_, i) => antallSider - kant + 1 + i)];
  }
  const naboer = Math.floor((antall - 4) / 2);
  return [
    1,
    null,
    ...Array.from({ length: antall - 4 }, (_, i) => gjeldende - naboer + i),
    null,
    antallSider,
  ];
}
