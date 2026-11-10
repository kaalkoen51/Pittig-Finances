import { describe, expect, it } from 'vitest';
import { addDays, addMonths, daysBetween, formatDate, isISODate, parseDate, periodRange } from './dates';

describe('dates', () => {
  it('validates ISO dates', () => {
    expect(isISODate('2026-02-28')).toBe(true);
    expect(isISODate('2026-02-29')).toBe(false);
    expect(isISODate('2028-02-29')).toBe(true);
    expect(isISODate('2026-13-01')).toBe(false);
    expect(isISODate('26-01-01')).toBe(false);
  });
  it('does arithmetic', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-01-15', -1)).toBe('2025-12-15');
    expect(daysBetween('2026-03-01', '2026-03-31')).toBe(30);
  });
  it('builds period ranges', () => {
    expect(periodRange('thisMonth', '2026-03-15')).toEqual({ from: '2026-03-01', to: '2026-03-31' });
    expect(periodRange('lastMonth', '2026-01-15')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
    expect(periodRange('thisYear', '2026-03-15')).toEqual({ from: '2026-01-01', to: '2026-12-31' });
    expect(periodRange('all', '2026-03-15')).toEqual({});
  });
  it.each([
    ['2026-03-12', '2026-03-12'],
    ['20260312', '2026-03-12'],
    ['12-03-2026', '2026-03-12'],
    ['12/03/2026', '2026-03-12'],
    ['12.03.2026', '2026-03-12'],
    ['1-3-26', '2026-03-01'],
    ['2026/3/1', '2026-03-01'],
    ['12-03-2026 14:00', '2026-03-12'],
    ['2026-03-12T10:00:00Z', '2026-03-12'],
  ])('parses user date %s', (input, iso) => {
    expect(parseDate(input)).toBe(iso);
  });
  it.each(['', '31-02-2026', '2026-13-01', 'gisteren', '12-2026'])('rejects %s', (input) => {
    expect(parseDate(input)).toBeNull();
  });
  it('formats', () => {
    expect(formatDate('2026-03-12', 'nl', 'short')).toBe('12-03-2026');
    expect(formatDate('2026-03-12', 'en', 'short')).toBe('12/03/2026');
    expect(formatDate('2026-03-12', 'nl', 'month')).toBe('maart 2026');
    expect(formatDate('2026-11-09', 'nl')).toBe('9 nov 2026');
  });
  it('formats in English by default', () => {
    expect(formatDate('2026-11-09')).toBe('9 Nov 2026');
    expect(formatDate('2026-11-09', 'en', 'month')).toBe('November 2026');
    expect(formatDate('2026-11-09', 'en', 'long')).toMatch(/^Monday,? 9 November 2026$/);
  });
});
