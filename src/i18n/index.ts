/**
 * i18n: one file per area (`<area>.ts` exporting `nl` and `en`). Dutch is the default and the
 * fallback. Usage:
 *   const t = useT('sales');      t('title');   t('someKey', { name: 'Toko' })
 *   const tc = useT('common');    tc('save')
 *   const f = useFormat();        f.money(1250) → "€ 12,50";  f.date('2026-03-12') → "12 mrt 2026"
 */
import { useCallback, useMemo } from 'react';
import { formatDate, formatMonth, type DateStyle } from '../domain/dates';
import { formatMoney, type FormatMoneyOptions } from '../domain/money';
import type { Cents, ISODate, Language } from '../domain/types';
import { useOptionalData } from '../state/store';
import * as batches from './batches';
import * as clients from './clients';
import * as common from './common';
import * as expenses from './expenses';
import * as importArea from './import';
import * as overview from './overview';
import * as sales from './sales';
import * as settings from './settings';
import * as suppliers from './suppliers';

export { plural, autoPluralUnit, unitFor } from './define';

export const AREAS = {
  common,
  overview,
  sales,
  clients,
  expenses,
  suppliers,
  batches,
  import: importArea,
  settings,
} as const;

export type Area = keyof typeof AREAS;
export type KeyOf<A extends Area> = keyof (typeof AREAS)[A]['nl'] & string;
export type Vars = Record<string, string | number>;
export type TFunction<A extends Area> = (key: KeyOf<A>, vars?: Vars) => string;

export const DEFAULT_LANGUAGE: Language = 'nl';

function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Non-hook translate (for tests and non-React code). Falls back to nl, then to the key. */
export function translate<A extends Area>(lang: Language, area: A, key: KeyOf<A>, vars?: Vars): string {
  const dicts = AREAS[area] as unknown as { nl: Record<string, string>; en: Record<string, string> };
  const s = (lang === 'en' ? dicts.en[key] : undefined) || dicts.nl[key] || key;
  return interpolate(s, vars);
}

/** Current UI language from settings ('nl' outside a StoreProvider). */
export function useLang(): Language {
  return useOptionalData()?.settings.language ?? DEFAULT_LANGUAGE;
}

export function useT<A extends Area>(area: A): TFunction<A> {
  const lang = useLang();
  return useCallback((key: KeyOf<A>, vars?: Vars) => translate(lang, area, key, vars), [lang, area]);
}

export interface Formatter {
  lang: Language;
  money(cents: Cents, opts?: FormatMoneyOptions): string;
  date(iso: ISODate | undefined | null, style?: DateStyle): string;
  /** 'YYYY-MM' → "maart 2026" */
  month(key: string): string;
}

export function useFormat(): Formatter {
  const lang = useLang();
  return useMemo(
    () => ({
      lang,
      money: (c, o) => formatMoney(c, lang, o),
      // One date look in the whole UI: "9 nov 2026". ('short' = numeric, kept for exports only.)
      date: (d, style = 'medium') => formatDate(d, lang, style === 'short' ? 'medium' : style),
      month: (k) => formatMonth(k, lang),
    }),
    [lang],
  );
}
