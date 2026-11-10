import type { Translations } from './define';

// Owned by the feature agent for this area. Add keys to nl first; en must have the same keys.
export const nl = {
  title: 'Uitgaven',
  emptyTitle: 'Nog geen uitgaven',
  emptyMessage: 'Voeg je eerste uitgave toe met de knop hierboven.',
} as const;

export const en: Translations<typeof nl> = {
  title: 'Expenses',
  emptyTitle: 'No expenses yet',
  emptyMessage: 'Add your first expense with the button above.',
};
