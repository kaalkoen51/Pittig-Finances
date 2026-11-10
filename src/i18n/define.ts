/** Every area file exports `nl` (source of truth for keys) and `en: Translations<typeof nl>`. */
export type Translations<T extends Record<string, string>> = { [K in keyof T]: string };
