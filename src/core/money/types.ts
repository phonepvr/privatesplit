export type CurrencyCode = 'INR' | 'USD' | 'EUR' | 'GBP' | 'AED' | 'SGD' | 'JPY' | 'AUD' | 'CAD';

export const CURRENCIES: ReadonlyArray<{
  code: CurrencyCode;
  label: string;
  minorPerMajor: number;
}> = [
  { code: 'INR', label: '₹ Indian Rupee', minorPerMajor: 100 },
  { code: 'USD', label: '$ US Dollar', minorPerMajor: 100 },
  { code: 'EUR', label: '€ Euro', minorPerMajor: 100 },
  { code: 'GBP', label: '£ British Pound', minorPerMajor: 100 },
  { code: 'AED', label: 'AED UAE Dirham', minorPerMajor: 100 },
  { code: 'SGD', label: 'S$ Singapore Dollar', minorPerMajor: 100 },
  { code: 'JPY', label: '¥ Japanese Yen', minorPerMajor: 1 },
  { code: 'AUD', label: 'A$ Australian Dollar', minorPerMajor: 100 },
  { code: 'CAD', label: 'C$ Canadian Dollar', minorPerMajor: 100 },
];

export function minorPerMajor(currency: CurrencyCode): number {
  return CURRENCIES.find((c) => c.code === currency)?.minorPerMajor ?? 100;
}
