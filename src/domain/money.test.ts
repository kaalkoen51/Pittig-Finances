import { describe, expect, it } from 'vitest';
import { centsToInput, eurosToCents, formatMoney, parseMoney } from './money';

const norm = (s: string) => s.replace(/[  ]/g, ' ');

describe('parseMoney', () => {
  it.each([
    ['12', 1200],
    ['12,5', 1250],
    ['12,50', 1250],
    ['12.50', 1250],
    ['0,99', 99],
    [',5', 50],
    ['1.234,56', 123456],
    ['1,234.56', 123456],
    ['1 234,56', 123456],
    ['1.234.567,89', 123456789],
    ['1.234', 123400],
    ['12.345', 1234500],
    ['0.125', 13],
    ['12,345', 1235],
    ['1,005', 101],
    ['€ 12,50', 1250],
    ['€12,50', 1250],
    ['12,50 €', 1250],
    ['EUR 7,95', 795],
    ['-12,50', -1250],
    ['−12,50', -1250],
    ['12,50-', -1250],
    ['(12,50)', -1250],
    ['+3', 300],
    ['12,-', 1200],
    ['0', 0],
    ['-0', 0],
  ])('parses %s', (input, cents) => {
    expect(parseMoney(input)).toBe(cents);
  });

  it.each(['', '   ', 'abc', '12,50,3', '1.23.4', '1,2.3,4', '--', '€', '12a', '1.2345,6'])('rejects %s', (input) => {
    expect(parseMoney(input)).toBeNull();
  });

  it('accepts numbers (euros)', () => {
    expect(parseMoney(12.5)).toBe(1250);
    expect(parseMoney(0.1 + 0.2)).toBe(30);
    expect(parseMoney(Number.NaN)).toBeNull();
    expect(parseMoney(null)).toBeNull();
  });
});

describe('eurosToCents', () => {
  it('rounds floats safely', () => {
    expect(eurosToCents(1.005)).toBe(101);
    expect(eurosToCents(-1.005)).toBe(-101);
    expect(eurosToCents(19.99)).toBe(1999);
  });
});

describe('formatMoney', () => {
  it('formats Dutch', () => {
    expect(norm(formatMoney(123456, 'nl'))).toBe('€ 1.234,56');
    expect(norm(formatMoney(5, 'nl'))).toBe('€ 0,05');
    expect(norm(formatMoney(-1250, 'nl'))).toBe('−€ 12,50');
    expect(norm(formatMoney(1250, 'nl', { signed: true }))).toBe('+€ 12,50');
    expect(norm(formatMoney(1200, 'nl', { compact: true }))).toBe('€ 12');
  });
  it('formats English', () => {
    expect(formatMoney(123456, 'en')).toBe('€1,234.56');
  });
});

describe('centsToInput', () => {
  it('round-trips with parseMoney', () => {
    for (const c of [0, 5, 99, 1250, -1250, 123456]) {
      expect(parseMoney(centsToInput(c, 'nl'))).toBe(c);
      expect(parseMoney(centsToInput(c, 'en'))).toBe(c);
    }
    expect(centsToInput(1250, 'nl')).toBe('12,50');
    expect(centsToInput(null)).toBe('');
  });
});
