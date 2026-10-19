/**
 * Organisation number: format and check digit.
 *
 * Kept free of React on purpose, the same way as tiltakSkjema.ts, so that
 * validateTiltakForm.test.ts can run in Vitest's node environment without
 * designsystemet-web trying to register custom elements.
 */

/** The weights MOD-11 uses on the first eight digits. The last digit is the check digit. */
const WEIGHTS = [3, 2, 7, 6, 5, 4, 3, 2] as const;

export const ORGNR_LENGTH = 9;

/** Nine digits, nothing else. Says nothing about whether the number is real. */
export function hasOrgnrFormat(value: string): boolean {
  return new RegExp(`^\\d{${ORGNR_LENGTH}}$`).test(value);
}

/**
 * MOD-11 check. Catches most typos that otherwise give nine valid
 * digits, for example 123456789, which looks right but is not an
 * organisation number.
 */
export function hasValidCheckDigit(value: string): boolean {
  if (!hasOrgnrFormat(value)) return false;

  const digits = [...value].map(Number);
  const sum = WEIGHTS.reduce((acc, weight, i) => acc + weight * digits[i], 0);
  const remainder = sum % 11;
  const check = remainder === 0 ? 0 : 11 - remainder;

  // Remainder 1 gives check digit 10, which does not fit in one digit. Such
  // numbers are not issued, so they are invalid.
  if (check === 10) return false;

  return check === digits[ORGNR_LENGTH - 1];
}
