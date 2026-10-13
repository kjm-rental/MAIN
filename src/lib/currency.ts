const phpCurrencyFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

export function formatPhp(amountInPesos: number): string {
  if (!Number.isInteger(amountInPesos) || amountInPesos < 0) {
    throw new RangeError("PHP amount must be a non-negative integer.");
  }

  return phpCurrencyFormatter.format(amountInPesos);
}

const centavoFormatter = new Intl.NumberFormat("en-PH", {
  style: "currency",
  currency: "PHP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
export function formatCentavos(amount: number): string {
  if (!Number.isSafeInteger(amount) || amount < 0)
    throw new RangeError("Centavos must be a non-negative safe integer.");
  return centavoFormatter.format(amount / 100);
}
