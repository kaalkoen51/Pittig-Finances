import type { Translations } from './define';

// Owned by the feature agent for this area. Add keys to nl first; en must have the same keys.
export const nl = {
  title: 'Wie ik betaal',
  emptyTitle: 'Je bent niemand iets schuldig',
  emptyMessage: 'Onbetaalde uitgaven verschijnen hier.',
} as const;

export const en: Translations<typeof nl> = {
  title: 'Who I owe',
  emptyTitle: 'You owe nobody anything',
  emptyMessage: 'Unpaid expenses appear here.',
};
