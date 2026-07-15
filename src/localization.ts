import type {
  BranchingProject,
  LocalizationCatalog,
  ScriptBlock,
} from "./domain.js";

export const UNDETERMINED_LOCALE = "und";

/** A deliberately small, author-friendly list. The stored value remains BCP-47. */
export const COMMON_LOCALES = [
  "es-419", "es-ES", "es-MX", "es-PE",
  "en-US", "en-GB", "pt-BR", "pt-PT", "fr-FR", "de-DE", "it-IT",
  "ja-JP", "ko-KR", "zh-Hans", "zh-Hant", "ar", "ru", "pl", "tr", "hi", "id", "nl", "sv", "uk",
] as const;

export type LocaleNames = Record<string, string>;

export function canonicalLocale(value: string | undefined): string {
  const candidate = value?.trim();
  if (!candidate) return UNDETERMINED_LOCALE;
  try {
    return Intl.getCanonicalLocales(candidate)[0] ?? UNDETERMINED_LOCALE;
  } catch {
    return UNDETERMINED_LOCALE;
  }
}

export function machineLocale(): string {
  if (typeof navigator === "undefined") return "en";
  return canonicalLocale(navigator.languages?.[0] ?? navigator.language ?? "en");
}

export function normalizeLocaleList(primaryLocale: string, locales: string[]): string[] {
  const primary = canonicalLocale(primaryLocale);
  return Array.from(new Set([primary, ...locales.map(canonicalLocale)]));
}

export function normalizeLocaleNames(
  localeNames: LocaleNames | undefined,
  locales: string[],
): LocaleNames | undefined {
  if (!localeNames) return undefined;
  const allowed = new Set(locales.map(canonicalLocale));
  const normalized = Object.fromEntries(
    Object.entries(localeNames)
      .filter((entry): entry is [string, string] => typeof entry[1] === "string")
      .map(([locale, name]) => [canonicalLocale(locale), name.trim()] as const)
      .filter(([locale, name]) => allowed.has(locale) && name.length > 0),
  );
  return Object.keys(normalized).length ? normalized : undefined;
}

export function localeDisplayName(locale: string, localeNames?: LocaleNames): string {
  const code = canonicalLocale(locale);
  const customName = localeNames?.[code];
  if (customName) return customName;
  try {
    return new Intl.DisplayNames(["es"], { type: "language" }).of(code) ?? code;
  } catch {
    return code;
  }
}

export function localeOptions(locales: string[], localeNames?: LocaleNames): string[] {
  return Array.from(new Set([...COMMON_LOCALES, ...locales.map(canonicalLocale)]))
    .sort((left, right) => localeDisplayName(left, localeNames).localeCompare(localeDisplayName(right, localeNames), "es"));
}

export function customLocaleId(name: string, existingLocales: string[]): string {
  const slug = name
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "language";
  const existing = new Set(existingLocales.map(canonicalLocale));
  let suffix = 1;
  let candidate = `und-x-${slug}`;
  while (existing.has(candidate)) {
    suffix += 1;
    candidate = `und-x-${slug}-${suffix}`;
  }
  return candidate;
}

export function scriptBlockTextKey(scriptId: string, blockId: string): string {
  return `script.${scriptId}.${blockId}`;
}

export function localizationValues(
  project: BranchingProject,
  textKey: string,
): Record<string, string> {
  return project.localizationCatalog?.entries[textKey]?.values ?? {};
}

export function localizedValue(
  values: Record<string, string>,
  locale: string,
  primaryLocale: string,
): string {
  const exact = canonicalLocale(locale);
  const primary = canonicalLocale(primaryLocale);
  const base = exact.split("-")[0];
  return values[exact] ?? values[base] ?? values[primary] ?? values[UNDETERMINED_LOCALE] ?? "";
}

export function blockValues(
  project: BranchingProject,
  scriptId: string,
  block: ScriptBlock,
  primaryLocale: string,
): Record<string, string> {
  const key = block.textKey ?? scriptBlockTextKey(scriptId, block.id);
  const catalogValues = localizationValues(project, key);
  if (Object.keys(catalogValues).length) return catalogValues;
  return {
    [canonicalLocale(primaryLocale)]: block.content ?? "",
    ...Object.fromEntries(
      Object.entries(block.translations ?? {}).map(([locale, value]) => [canonicalLocale(locale), value]),
    ),
  };
}

export function normalizeLocalizationCatalog(
  project: BranchingProject,
  primaryLocale: string,
): BranchingProject {
  const primary = canonicalLocale(primaryLocale);
  const entries: LocalizationCatalog["entries"] = {
    ...(project.localizationCatalog?.entries ?? {}),
  };
  const scriptDocuments = (project.scriptDocuments ?? []).map((document) => ({
    ...document,
    blocks: document.blocks.map((block) => {
      const textKey = block.textKey ?? scriptBlockTextKey(document.id, block.id);
      const existing = entries[textKey]?.values ?? {};
      const legacyTranslations = Object.fromEntries(
        Object.entries(block.translations ?? {}).map(([locale, value]) => [canonicalLocale(locale), value]),
      );
      const values = { ...legacyTranslations, ...existing };
      if (values[primary] === undefined) {
        values[primary] = block.content ?? "";
      } else if (block.content && values[primary] !== block.content && values[UNDETERMINED_LOCALE] === undefined) {
        values[UNDETERMINED_LOCALE] = block.content;
      }
      entries[textKey] = { values };
      return {
        ...block,
        textKey,
        characterRef: block.characterRef ?? block.speakerRef,
      };
    }),
  }));
  return {
    ...project,
    scriptDocuments,
    localizationCatalog: {
      primaryLocale: primary,
      locales: normalizeLocaleList(primary, project.localizationCatalog?.locales ?? Object.keys(entries).flatMap((key) => Object.keys(entries[key]?.values ?? {}))),
      entries,
    },
  };
}

export function updateLocalizedEntry(
  project: BranchingProject,
  textKey: string,
  locale: string,
  value: string,
  primaryLocale: string,
): BranchingProject {
  const code = canonicalLocale(locale);
  const entries = project.localizationCatalog?.entries ?? {};
  const nextValues = {
    ...(entries[textKey]?.values ?? {}),
    [code]: value,
  };
  const primary = canonicalLocale(primaryLocale);
  return {
    ...project,
    localizationCatalog: {
      primaryLocale: primary,
      locales: normalizeLocaleList(primary, project.localizationCatalog?.locales ?? []),
      entries: {
        ...entries,
        [textKey]: { values: nextValues },
      },
    },
    // Keep v0.1 mirrors during the compatibility window. The catalog remains canonical.
    scriptDocuments: (project.scriptDocuments ?? []).map((document) => ({
      ...document,
      blocks: document.blocks.map((block) => {
        if ((block.textKey ?? scriptBlockTextKey(document.id, block.id)) !== textKey) return block;
        return {
          ...block,
          textKey,
          content: nextValues[primary] ?? block.content,
          translations: Object.fromEntries(
            Object.entries(nextValues).filter(([entryLocale]) => entryLocale !== primary),
          ),
        };
      }),
    })),
  };
}
