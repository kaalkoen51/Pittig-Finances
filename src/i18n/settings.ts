import type { Translations } from './define';

// Owned by the feature agent for this area. Add keys to nl first; en must have the same keys.
export const nl = {
  title: 'Instellingen',
  businessName: 'Bedrijfsnaam',
  language: 'Taal',
  backupNow: 'Maak nu een back-up',
  lastBackup: 'Laatste back-up: {date}',
  loadDemoData: 'Laad voorbeeldgegevens',
} as const;

export const en: Translations<typeof nl> = {
  title: 'Settings',
  businessName: 'Business name',
  language: 'Language',
  backupNow: 'Back up now',
  lastBackup: 'Last backup: {date}',
  loadDemoData: 'Load demo data',
};
