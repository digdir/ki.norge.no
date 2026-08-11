/**
 * Organisasjonsnummer: format og kontrollsiffer.
 *
 * Holdt fri for React med vilje, på samme måte som tiltakSkjema.ts, slik at
 * validateTiltakForm.test.ts kan kjøre i Vitest sitt node-miljø uten at
 * designsystemet-web prøver å registrere custom elements.
 */

/** Vektene MOD-11 bruker på de åtte første sifrene. Siste siffer er kontrollsifferet. */
const WEIGHTS = [3, 2, 7, 6, 5, 4, 3, 2] as const;

export const ORGNR_LENGTH = 9;

/** Ni siffer, ingenting annet. Sier ingenting om nummeret er ekte. */
export function hasOrgnrFormat(value: string): boolean {
  return new RegExp(`^\\d{${ORGNR_LENGTH}}$`).test(value);
}

/**
 * MOD-11-kontroll. Fanger de fleste tastefeil som ellers gir ni gyldige
 * siffer, for eksempel 123456789, som ser riktig ut men ikke er et
 * organisasjonsnummer.
 */
export function hasValidCheckDigit(value: string): boolean {
  if (!hasOrgnrFormat(value)) return false;

  const digits = [...value].map(Number);
  const sum = WEIGHTS.reduce((acc, weight, i) => acc + weight * digits[i], 0);
  const remainder = sum % 11;
  const check = remainder === 0 ? 0 : 11 - remainder;

  // Rest 1 gir kontrollsiffer 10, som ikke får plass i ett siffer. Slike
  // nummer deles ikke ut, så de er ugyldige.
  if (check === 10) return false;

  return check === digits[ORGNR_LENGTH - 1];
}
