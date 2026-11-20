/** Indian short amounts: lakhs from ₹1L, crores from ₹1Cr. */
const LAKH_THRESHOLD = 100_000;
const CRORE_THRESHOLD = 10_000_000;

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
  const lakhs = Math.abs(value) / LAKH_THRESHOLD;
  return `${sign}₹${lakhs.toFixed(decimalPlaces)}L`;
}

export function formatIndianCrores(value: number, decimalPlaces = 2): string {
  const sign = value < 0 ? '-' : '';
  const crores = Math.abs(value) / CRORE_THRESHOLD;
  return `${sign}₹${crores.toFixed(decimalPlaces)}Cr`;
}

/** Pick L / Cr / full number for compact display. */
export function formatIndianAbbreviated(value: number, decimalPlaces = 2): string {
  const abs = Math.abs(value);
  if (abs >= CRORE_THRESHOLD) {
    return formatIndianCrores(value, decimalPlaces);
  }
  if (abs >= LAKH_THRESHOLD) {
    return formatIndianLakhs(value, decimalPlaces);
  }
  return formatIndianCurrency(value, decimalPlaces);
}

export function shouldAbbreviateIndianCurrency(value: number): boolean {
  return Math.abs(value) >= LAKH_THRESHOLD;
}

/** @deprecated Use shouldAbbreviateIndianCurrency — kept for existing imports. */
export function shouldAbbreviateInLakhs(value: number): boolean {
  return shouldAbbreviateIndianCurrency(value);
}

export function formatIndianCurrencyDisplay(
  value: number,
  options: { abbreviated?: boolean; maximumFractionDigits?: number } = {}
): string {
  const { abbreviated = false, maximumFractionDigits = 2 } = options;

  if (abbreviated && shouldAbbreviateIndianCurrency(value)) {
    return formatIndianAbbreviated(value, maximumFractionDigits);
  }

  return formatIndianCurrency(value, maximumFractionDigits);
}