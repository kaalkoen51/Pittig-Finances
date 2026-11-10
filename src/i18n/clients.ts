import type { Translations } from './define';

// Owned by the feature agent for this area. Add keys to nl first; en must have the same keys.
export const nl = {
  title: 'Klanten',
  emptyTitle: 'Nog geen klanten',
  emptyMessage: 'Klanten verschijnen hier zodra je een verkoop aan iemand toevoegt.',
} as const;

export const en: Translations<typeof nl> = {
  title: 'Clients',
  emptyTitle: 'No clients yet',
  emptyMessage: 'Clients appear here as soon as you add a sale to someone.',
};
