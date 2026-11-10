import { describe, expect, it } from 'vitest';
import { AREAS, DEFAULT_LANGUAGE, autoPluralUnit, translate, unitFor } from './index';

describe('i18n', () => {
  it('every area has the same keys in nl and en', () => {
    for (const [area, d] of Object.entries(AREAS)) {
      expect(Object.keys(d.en).sort(), area).toEqual(Object.keys(d.nl).sort());
    }
  });
  it('translates, interpolates and falls back', () => {
    expect(translate('nl', 'common', 'save')).toBe('Bewaar');
    expect(translate('en', 'common', 'save')).toBe('Save');
    expect(translate('en', 'common', 'deleteTitle', { name: 'Toko' })).toBe('Delete Toko?');
    expect(translate('en', 'settings', 'lastBackup', { date: 'today' })).toBe('Last backup: today');
    expect(DEFAULT_LANGUAGE).toBe('en');
  });
  it('pluralises units in English and Dutch', () => {
    expect(autoPluralUnit('jar', 'en')).toBe('jars');
    expect(autoPluralUnit('bottle', 'en')).toBe('bottles');
    expect(autoPluralUnit('box', 'en')).toBe('boxes');
    expect(autoPluralUnit('piece', 'en')).toBe('pieces');
    expect(autoPluralUnit('kg', 'en')).toBe('kg');
    expect(unitFor({ unit: 'jar' }, 1, 'en')).toBe('jar');
    expect(unitFor({ unit: 'jar' }, 2, 'en')).toBe('jars');
    expect(autoPluralUnit('pot', 'nl')).toBe('potten');
    expect(autoPluralUnit('fles', 'nl')).toBe('flessen');
  });
});
