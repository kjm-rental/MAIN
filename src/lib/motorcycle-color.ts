/** Keep combination order; normalize presentation, never infer a color. */
export function normalizeMotorcycleColor(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\s*\/\s*/g, " / ")
    .toLowerCase()
    .replace(
      /(^|[^\p{L}\p{N}])(\p{L})/gu,
      (_, prefix: string, letter: string) => prefix + letter.toUpperCase(),
    );
}
export function normalizeLicensePlate(value: string): string {
  return value.trim().toUpperCase();
}
export function validLicensePlate(value: string): boolean {
  return /^(?=.*[A-Z0-9])[A-Z0-9 -]{2,20}$/.test(value);
}
