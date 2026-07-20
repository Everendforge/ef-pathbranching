/** Shared locale policy for every Everend Forge public surface.
 *
 * The package intentionally has no storage or UI dependency: desktop apps can
 * bridge it to Tauri while web surfaces use localStorage. Its public contract
 * is compatible with i18next language tags and resource objects.
 */
export const SUPPORTED_LOCALES = ["en", "es"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export type LocalePreference = "system" | Locale;

export type TranslationValue = string | TranslationCatalog;
export type TranslationCatalog = { readonly [key: string]: TranslationValue };

const supported = new Set<string>(SUPPORTED_LOCALES);

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && supported.has(value);
}

export function normalizeLocale(value: unknown): Locale | undefined {
  if (typeof value !== "string") return undefined;
  const base = value.trim().replace(/_/g, "-").split("-")[0]?.toLowerCase();
  return isLocale(base) ? base : undefined;
}

export function normalizeLocalePreference(value: unknown): LocalePreference {
  return value === "system" || isLocale(value) ? value : "system";
}

export function resolveLocale(
  preference: unknown,
  systemLocales: readonly string[] | undefined = typeof navigator === "undefined"
    ? undefined
    : [...(navigator.languages ?? []), navigator.language],
): Locale {
  const preferred = normalizeLocalePreference(preference);
  if (preferred !== "system") return preferred;
  for (const candidate of systemLocales ?? []) {
    const locale = normalizeLocale(candidate);
    if (locale) return locale;
  }
  return "en";
}

export function setDocumentLocale(locale: Locale) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  document.documentElement.dir = "ltr";
}

export function formatDate(value: Date | number | string, locale: Locale, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale, options).format(new Date(value));
}

export function formatNumber(value: number, locale: Locale, options?: Intl.NumberFormatOptions) {
  return new Intl.NumberFormat(locale, options).format(value);
}

export function formatList(values: readonly string[], locale: Locale, options?: Intl.ListFormatOptions) {
  return new Intl.ListFormat(locale, options).format(values);
}

export function interpolate(template: string, values: Record<string, string | number> = {}) {
  return template.replace(/{{\s*([\w.-]+)\s*}}/g, (_, key: string) => String(values[key] ?? `{{${key}}}`));
}

function lookup(catalog: TranslationCatalog, key: string): string | undefined {
  const value = key.split(".").reduce<TranslationValue | undefined>(
    (current, part) => (current && typeof current !== "string" ? current[part] : undefined),
    catalog,
  );
  return typeof value === "string" ? value : undefined;
}

/** Small i18next-compatible translation adapter for static resource catalogs. */
export function createTranslator(
  resources: Record<Locale, TranslationCatalog>,
  locale: Locale,
) {
  return (key: string, values?: Record<string, string | number>) =>
    interpolate(lookup(resources[locale], key) ?? lookup(resources.en, key) ?? key, values);
}

function leaves(catalog: TranslationCatalog, prefix = "", result = new Map<string, string>()) {
  for (const [key, value] of Object.entries(catalog)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") result.set(path, value);
    else leaves(value, path, result);
  }
  return result;
}

/** Throws a readable error when a translation is missing or uses different interpolation tokens. */
export function assertCatalogParity(source: TranslationCatalog, translation: TranslationCatalog) {
  const sourceLeaves = leaves(source);
  const translationLeaves = leaves(translation);
  const missing = [...sourceLeaves.keys()].filter((key) => !translationLeaves.has(key));
  const extra = [...translationLeaves.keys()].filter((key) => !sourceLeaves.has(key));
  const mismatched = [...sourceLeaves].flatMap(([key, text]) => {
    const translated = translationLeaves.get(key);
    if (!translated) return [];
    const tokens = (input: string) => [...input.matchAll(/{{\s*([\w.-]+)\s*}}/g)].map((match) => match[1]).sort().join(",");
    return tokens(text) === tokens(translated) ? [] : [key];
  });
  if (missing.length || extra.length || mismatched.length) {
    throw new Error(`Invalid i18n catalog: missing=[${missing.join(", ")}], extra=[${extra.join(", ")}], interpolations=[${mismatched.join(", ")}]`);
  }
}
