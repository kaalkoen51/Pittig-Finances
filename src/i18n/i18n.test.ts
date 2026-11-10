import { describe, expect, it } from 'vitest';
import { AREAS, translate } from './index';

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
  });
});
