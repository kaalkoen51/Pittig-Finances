import type { Translations } from './define';

// Owned by the feature agent for this area. Add keys to nl first; en must have the same keys.
export const nl = {
  title: 'Batches',
  emptyTitle: 'Nog geen producten',
  emptyMessage: 'Voeg een product toe en daarna je eerste batch.',
} as const;

export const en: Translations<typeof nl> = {
  title: 'Batches',
  emptyTitle: 'No products yet',
  emptyMessage: 'Add a product and then your first batch.',
};
