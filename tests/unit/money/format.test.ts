import { describe, expect, it } from 'vitest';
import { formatMinor, parseMajorToMinor } from '../../../src/core/money/format';

describe('formatMinor', () => {
  it('formats INR with paise', () => {
    expect(formatMinor(123456, 'INR')).toBe('₹1,234.56');
  });
  it('formats zero', () => {
    expect(formatMinor(0, 'INR')).toBe('₹0.00');
  });
  it('formats negative', () => {
    expect(formatMinor(-50, 'INR')).toBe('-₹0.50');
  });
  it('formats JPY without decimals', () => {
    expect(formatMinor(1234, 'JPY')).toBe('¥1,234');
  });
  it('formats USD', () => {
    expect(formatMinor(2599, 'USD')).toBe('$25.99');
  });
});

describe('parseMajorToMinor', () => {
  it('parses ".50" to 50 paise', () => {
    expect(parseMajorToMinor('0.50', 'INR')).toBe(50);
  });
  it('parses "100" to 10000 paise', () => {
    expect(parseMajorToMinor('100', 'INR')).toBe(10000);
  });
  it('rejects garbage', () => {
    expect(parseMajorToMinor('abc', 'INR')).toBeNull();
  });
  it('parses negatives', () => {
    expect(parseMajorToMinor('-1.25', 'USD')).toBe(-125);
  });
  it('handles JPY (no decimals)', () => {
    expect(parseMajorToMinor('100', 'JPY')).toBe(100);
    expect(parseMajorToMinor('100.50', 'JPY')).toBeNull();
  });
});
