import type { Translations } from './define';

// Owned by the feature agent for this area. Add keys to nl first; en must have the same keys.
export const nl = {
  title: 'Verkopen',
  emptyTitle: 'Nog geen verkopen',
  emptyMessage: 'Voeg je eerste verkoop toe met de knop hierboven.',
} as const;

export const en: Translations<typeof nl> = {
  title: 'Sales',
  emptyTitle: 'No sales yet',
  emptyMessage: 'Add your first sale with the button above.',
};
