/** Every area file exports `nl` (source of truth for keys) and `en: Translations<typeof nl>`. */
export type Translations<T extends Record<string, string>> = { [K in keyof T]: string };

/** Pick the singular or plural text for a count: plural(3, '1 klant', '{count} klanten'). */
export function plural(count: number, one: string, other: string): string {
  return count === 1 ? one : other;
}

/**
 * Best-guess plural of a unit word, used when a product has no `unitPlural`:
 * nl: pot → potten, fles → flessen, zak → zakken, doos → dozen, potje → potjes, beker → bekers,
 * stuk → stuks; en: jar → jars, box → boxes, bottle → bottles.
 */
export function autoPluralUnit(unit: string, lang: 'nl' | 'en'): string {
  const w = unit.trim();
  if (!w || /\s/.test(w)) return w;
  const lower = w.toLowerCase();
  if (lang === 'en') {
    if (/^(pcs|kg|g|gr|mg|l|ml|cl|dl|oz|lb|lbs|x)$/.test(lower)) return w; // abbreviations stay as they are
    if (/(s|x|z|ch|sh)$/.test(lower)) return w + 'es';
    if (/[^aeiou]y$/.test(lower)) return w.slice(0, -1) + 'ies';
    return w + 's';
  }
  if (lower === 'stuk') return w + 's';
  if (/(je|e|el|em|en|er|aar|on)$/.test(lower) && !/ee$/.test(lower)) return w + 's';
  if (/[aiouy]$/.test(lower)) return w + "'s";
  const m = /^(.*?)([^aeiouy]*)([aeiouy]+)([^aeiouy])$/.exec(lower);
  if (m) {
    const vowels = m[3]!;
    const last = w.slice(-1);
    const stem = w.slice(0, -1 - vowels.length);
    if (vowels.length === 1) return w + last + 'en'; // short vowel: double the consonant
    if (vowels.length === 2 && vowels[0] === vowels[1]) {
      const soft = last === 's' ? 'z' : last === 'f' ? 'v' : last;
      return stem + vowels[0] + soft + 'en'; // doos → dozen, zaak → zaken
    }
  }
  return w + 'en';
}

/** Unit word for a quantity: 1 pot, 2 potten (uses the product's own plural when set). */
export function unitFor(product: { unit: string; unitPlural?: string }, count: number, lang: 'nl' | 'en'): string {
  if (count === 1) return product.unit;
  return product.unitPlural?.trim() || autoPluralUnit(product.unit, lang);
}
