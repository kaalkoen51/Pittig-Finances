import type { Translations } from './define';

// Owned by the feature agent for this area. Add keys to nl first; en must have the same keys.
export const nl = {
  title: 'Overzicht',
  emptyTitle: 'Welkom bij Pittig Finances',
  emptyMessage: 'Begin met je eerste verkoop of uitgave.',
} as const;

export const en: Translations<typeof nl> = {
  title: 'Overview',
  emptyTitle: 'Welcome to Pittig Finances',
  emptyMessage: 'Start with your first sale or expense.',
};
