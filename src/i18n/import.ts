import type { Translations } from './define';

// Owned by the feature agent for this area. Add keys to nl first; en must have the same keys.
export const nl = {
  title: 'Te sorteren',
  emptyTitle: 'Alles is gesorteerd',
  emptyMessage: 'Importeer een bankafschrift of Excel-bestand via Instellingen.',
} as const;

export const en: Translations<typeof nl> = {
  title: 'To sort',
  emptyTitle: 'Everything is sorted',
  emptyMessage: 'Import a bank statement or Excel file from Settings.',
};
