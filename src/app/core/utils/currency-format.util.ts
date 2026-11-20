/** Abbreviate to lakhs (e.g. ₹1.19 L) at and above one lakh — matches Indian convention. */
const LAKH_THRESHOLD = 100_000;

export function formatIndianNumber(
  value: number,
  minimumFractionDigits = 0,
  maximumFractionDigits = 2
): string {
  return Math.abs(value).toLocaleString('en-IN', {
    minimumFractionDigits,
    maximumFractionDigits
  });
}

export function formatIndianCurrency(
  value: number,
  maximumFractionDigits = 2
): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}₹${formatIndianNumber(value, 0, maximumFractionDigits)}`;
}

export function formatIndianLakhs(value: number, decimalPlaces = 2): string {
  const sign = value < 0 ? '-' : '';
  const lakhs = Math.abs(value) / 100000;
  return `${sign}₹${lakhs.toFixed(decimalPlaces)} L`;
}

export function shouldAbbreviateInLakhs(value: number): boolean {
  return Math.abs(value) >= LAKH_THRESHOLD;
}

export function formatIndianCurrencyDisplay(
  value: number,
  options: { abbreviated?: boolean; maximumFractionDigits?: number } = {}
): string {
  const { abbreviated = false, maximumFractionDigits = 2 } = options;

  if (abbreviated && shouldAbbreviateInLakhs(value)) {
    return formatIndianLakhs(value);
  }

  return formatIndianCurrency(value, maximumFractionDigits);
}
