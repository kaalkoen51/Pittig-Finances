import type { DateRange, ISODate, Language, PeriodKey } from './types';

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** Local date → 'YYYY-MM-DD'. */
export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Today as 'YYYY-MM-DD' in local time. */
export function today(): ISODate {
  return toISODate(new Date());
}

export function isISODate(s: unknown): s is ISODate {
  if (typeof s !== 'string') return false;
  const m = ISO_RE.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1) return false;
  return d <= daysInMonth(y, mo);
}

export function daysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate();
}

/** 'YYYY-MM-DD' → local Date at midnight. Throws on invalid input. */
export function fromISODate(s: ISODate): Date {
  if (!isISODate(s)) throw new Error(`Invalid date: ${s}`);
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

export function addDays(s: ISODate, days: number): ISODate {
  const d = fromISODate(s);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function addMonths(s: ISODate, months: number): ISODate {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${pad(ny, 4)}-${pad(nm)}-${pad(Math.min(d, daysInMonth(ny, nm)))}`;
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: ISODate, b: ISODate): number {
  const ms = fromISODate(b).getTime() - fromISODate(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** ISO dates compare correctly as strings; this is a sort comparator. */
export function compareDates(a: ISODate, b: ISODate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** 'YYYY-MM' */
export function monthKey(s: ISODate): string {
  return s.slice(0, 7);
}

export function startOfMonth(s: ISODate): ISODate {
  return `${s.slice(0, 7)}-01`;
}

export function endOfMonth(s: ISODate): ISODate {
  const [y, m] = s.split('-').map(Number) as [number, number];
  return `${s.slice(0, 7)}-${pad(daysInMonth(y, m))}`;
}

export function inRange(s: ISODate, r: DateRange): boolean {
  if (r.from && s < r.from) return false;
  if (r.to && s > r.to) return false;
  return true;
}

/** Date range for an Overview period. */
export function periodRange(period: PeriodKey, ref: ISODate = today()): DateRange {
  switch (period) {
    case 'thisMonth':
      return { from: startOfMonth(ref), to: endOfMonth(ref) };
    case 'lastMonth': {
      const prev = addMonths(startOfMonth(ref), -1);
      return { from: prev, to: endOfMonth(prev) };
    }
    case 'thisYear':
      return { from: `${ref.slice(0, 4)}-01-01`, to: `${ref.slice(0, 4)}-12-31` };
    case 'all':
      return {};
  }
}

/** Range for a 'YYYY-MM' month key. */
export function monthRange(key: string): DateRange {
  const from = `${key}-01`;
  return { from, to: endOfMonth(from) };
}

const LOCALE: Record<Language, string> = { nl: 'nl-NL', en: 'en-GB' };

export type DateStyle = 'short' | 'medium' | 'long' | 'month';

/**
 * Display a date: short "12-03-2026" (nl) / "12/03/2026" (en); medium "12 mrt 2026";
 * long "donderdag 12 maart 2026"; month "maart 2026".
 */
export function formatDate(s: ISODate | undefined | null, lang: Language = 'nl', style: DateStyle = 'medium'): string {
  if (!s || !isISODate(s)) return '';
  const d = fromISODate(s);
  if (style === 'short') {
    const sep = lang === 'nl' ? '-' : '/';
    return `${pad(d.getDate())}${sep}${pad(d.getMonth() + 1)}${sep}${d.getFullYear()}`;
  }
  const opts: Intl.DateTimeFormatOptions =
    style === 'long'
      ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
      : style === 'month'
        ? { month: 'long', year: 'numeric' }
        : { day: 'numeric', month: 'short', year: 'numeric' };
  return new Intl.DateTimeFormat(LOCALE[lang], opts).format(d);
}

/** Month key 'YYYY-MM' → "maart 2026". */
export function formatMonth(key: string, lang: Language = 'nl'): string {
  return formatDate(`${key}-01`, lang, 'month');
}

/**
 * Parse a user/bank date. Accepts 'YYYY-MM-DD', 'YYYYMMDD', 'DD-MM-YYYY', 'D-M-YY',
 * 'DD/MM/YYYY', 'DD.MM.YYYY' (day first, Dutch style) and JS Date objects.
 * Two-digit years are 2000–2099. Returns null when invalid.
 */
export function parseDate(input: string | Date | null | undefined): ISODate | null {
  if (input === null || input === undefined) return null;
  if (input instanceof Date) return Number.isNaN(input.getTime()) ? null : toISODate(input);
  const s = input.trim();
  if (!s) return null;
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (m) return build(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return build(Number(m[1]), Number(m[2]), Number(m[3]));
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})(?:\s.*)?$/.exec(s);
  if (m) {
    let y = Number(m[3]);
    if (m[3]!.length === 2) y += 2000;
    return build(y, Number(m[2]), Number(m[1]));
  }
  return null;
}

function build(y: number, m: number, d: number): ISODate | null {
  const s = `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
  return isISODate(s) ? s : null;
}
