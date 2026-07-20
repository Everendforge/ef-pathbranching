/**
 * Core-safe mirror of the app locale preference contract from
 * `packages/i18n/src/index.ts`. The core build (`tsconfig.build.json`)
 * must not reach outside the package root, so the few symbols that
 * persisted workspace settings depend on live here; the UI keeps using
 * the shared package through `src/i18n.ts`.
 */
export const SUPPORTED_APP_LOCALES = ["en", "es"] as const;
export type AppLocale = (typeof SUPPORTED_APP_LOCALES)[number];
export type LocalePreference = "system" | AppLocale;

export function normalizeLocalePreference(value: unknown): LocalePreference {
  return value === "system" || SUPPORTED_APP_LOCALES.includes(value as AppLocale)
    ? (value as LocalePreference)
    : "system";
}
