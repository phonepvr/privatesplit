import { type CurrencyCode, minorPerMajor } from './types';

const CURRENCY_SYMBOL: Record<CurrencyCode, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
  AED: 'AED ',
  SGD: 'S$',
  JPY: '¥',
  AUD: 'A$',
  CAD: 'C$',
};

export function formatMinor(amountMinor: number, currency: CurrencyCode): string {
  const factor = minorPerMajor(currency);
  const sign = amountMinor < 0 ? '-' : '';
  const absMinor = Math.abs(amountMinor);
  const major = Math.floor(absMinor / factor);
  if (factor === 1) {
    return `${sign}${CURRENCY_SYMBOL[currency]}${major.toLocaleString('en-IN')}`;
  }
  const minor = absMinor % factor;
  const minorStr = minor.toString().padStart(String(factor - 1).length, '0');
  return `${sign}${CURRENCY_SYMBOL[currency]}${major.toLocaleString('en-IN')}.${minorStr}`;
}

export function parseMajorToMinor(input: string, currency: CurrencyCode): number | null {
  const trimmed = input.trim().replace(/[, ]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return null;
  const factor = minorPerMajor(currency);
  const negative = trimmed.startsWith('-');
  const body = negative ? trimmed.slice(1) : trimmed;
  const [whole, frac = ''] = body.split('.');
  if (factor === 1) {
    if (frac.length > 0) return null;
    const n = Number(whole);
    return negative ? -n : n;
  }
  const fracDigits = String(factor - 1).length;
  const fracPadded = frac.padEnd(fracDigits, '0').slice(0, fracDigits);
  const minor = Number(whole) * factor + Number(fracPadded || 0);
  return negative ? -minor : minor;
}

export function symbolFor(currency: CurrencyCode): string {
  return CURRENCY_SYMBOL[currency];
}
