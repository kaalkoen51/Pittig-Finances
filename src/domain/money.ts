import type { Cents, Language } from './types';

const LOCALE: Record<Language, string> = { nl: 'nl-NL', en: 'en-GB' };

const fmtCache = new Map<string, Intl.NumberFormat>();
function nf(lang: Language, opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = lang + JSON.stringify(opts);
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE[lang], opts);
    fmtCache.set(key, f);
  }
  return f;
}

export interface FormatMoneyOptions {
  /** Always show a sign: "+€ 12,50" / "−€ 12,50". */
  signed?: boolean;
  /** Drop ",00" for whole euros. */
  compact?: boolean;
}

/**
 * Format cents as euros: nl → "€ 1.234,56", en → "€1,234.56".
 * Negative values use a real minus sign "−". Non-breaking spaces are used by Intl.
 */
export function formatMoney(cents: Cents, lang: Language = 'nl', opts: FormatMoneyOptions = {}): string {
  const whole = cents % 100 === 0;
  const digits = opts.compact && whole ? 0 : 2;
  const f = nf(lang, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  const abs = f.format(Math.abs(cents) / 100);
  if (cents < 0) return '−' + abs;
  if (opts.signed && cents > 0) return '+' + abs;
  return abs;
}

/** Plain number without currency symbol, for editing: 1234.5 € → "1234,50" (nl) / "1234.50" (en). */
export function centsToInput(cents: Cents | null | undefined, lang: Language = 'nl'): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return '';
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const euros = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, '0');
  const sep = lang === 'nl' ? ',' : '.';
  return `${neg ? '-' : ''}${euros}${sep}${rest}`;
}

/** Plain number with thousands separators, no symbol: "1.234,56". */
export function formatNumber(value: number, lang: Language = 'nl', fractionDigits = 0): string {
  return nf(lang, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(value);
}

/** Euros (float, e.g. from Excel) → cents, rounded half away from zero. */
export function eurosToCents(euros: number): Cents {
  const sign = euros < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(euros) * 100 + 1e-7);
}

export function centsToEuros(cents: Cents): number {
  return cents / 100;
}

/**
 * Parse user / bank input into cents. Returns null when it is not a number.
 *
 * Accepts: "12", "12,5", "12,50", "12.50", "1.234,56", "1,234.56", "1 234,56",
 * "€ 12,50", "12,50 €", "EUR 12", "-12,50", "12,50-", "(12,50)", "12,-", "+3".
 * Rules: if both "." and "," occur, the last one is the decimal separator.
 * A lone "," is decimal (Dutch). A lone "." is decimal unless it is followed by
 * exactly three digits ("1.234" = 1234 euros, Dutch thousands); multiple equal
 * separators are thousands separators. More than two decimals are rounded.
 */
export function parseMoney(input: string | number | null | undefined): Cents | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? eurosToCents(input) : null;
  let s = input.trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/eur(o)?s?/gi, '').replace(/€/g, '');
  s = s.replace(/[\s  ']/g, '');
  s = s.replace(/−/g, '-');
  // Dutch "12,-" or "12.-" means whole euros.
  s = s.replace(/[.,]-$/, '');
  if (s.endsWith('-')) {
    negative = !negative;
    s = s.slice(0, -1);
  }
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }
  if (!s || !/^[0-9.,]+$/.test(s) || !/[0-9]/.test(s)) return null;

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let intPart: string;
  let fracPart = '';
  if (lastDot >= 0 && lastComma >= 0) {
    const decSep = lastDot > lastComma ? '.' : ',';
    const thouSep = decSep === '.' ? ',' : '.';
    const idx = s.lastIndexOf(decSep);
    intPart = s.slice(0, idx);
    fracPart = s.slice(idx + 1);
    if (intPart.includes(decSep) || fracPart.includes(thouSep)) return null;
    if (!validThousands(intPart, thouSep)) return null;
    intPart = intPart.split(thouSep).join('');
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.';
    const parts = s.split(sep);
    if (parts.length > 2) {
      if (!validThousands(s, sep)) return null;
      intPart = parts.join('');
    } else {
      const [a, b] = parts as [string, string];
      if (sep === '.' && b.length === 3 && a.length > 0 && a.length <= 3 && a !== '0') {
        intPart = a + b; // "1.234" → 1234
      } else {
        intPart = a;
        fracPart = b;
      }
    }
  } else {
    intPart = s;
  }
  if (intPart === '') intPart = '0';
  if (!/^\d+$/.test(intPart) || (fracPart !== '' && !/^\d+$/.test(fracPart))) return null;

  const euros = Number(intPart);
  let cents: number;
  if (fracPart.length <= 2) {
    cents = euros * 100 + Number(fracPart.padEnd(2, '0') || '0');
  } else {
    const first2 = Number(fracPart.slice(0, 2));
    const roundUp = Number(fracPart[2]) >= 5;
    cents = euros * 100 + first2 + (roundUp ? 1 : 0);
  }
  if (!Number.isSafeInteger(cents)) return null;
  return negative && cents !== 0 ? -cents : cents;
}

function validThousands(s: string, sep: string): boolean {
  const groups = s.split(sep);
  if (groups.length === 1) return true;
  const [first, ...rest] = groups;
  if (!first || first.length > 3) return false;
  return rest.every((g) => g.length === 3);
}

/** Sum helper that keeps integer cents. */
export function sumCents(values: Iterable<Cents>): Cents {
  let t = 0;
  for (const v of values) t += v;
  return t;
}
