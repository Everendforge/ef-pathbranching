import { useMemo, useState } from "react";
import {
  customLocaleId,
  localeDisplayName,
  localeOptions,
  normalizeLocaleList,
  normalizeLocaleNames,
  type LocaleNames,
} from "../localization.js";

export type LocalizationSettings = {
  primaryLocale: string;
  locales: string[];
  localeNames?: LocaleNames;
};

function normalize(settings: LocalizationSettings): LocalizationSettings {
  const locales = normalizeLocaleList(settings.primaryLocale, settings.locales);
  return {
    primaryLocale: locales[0],
    locales,
    localeNames: normalizeLocaleNames(settings.localeNames, locales),
  };
}

export function LocaleSettingsFields({
  value,
  fallbackLocale,
  onChange,
}: {
  value?: LocalizationSettings;
  fallbackLocale: string;
  onChange: (value: LocalizationSettings) => void;
}) {
  const settings = normalize(value ?? { primaryLocale: fallbackLocale, locales: [fallbackLocale] });
  const [inventedLanguage, setInventedLanguage] = useState("");
  const options = useMemo(
    () => localeOptions(settings.locales, settings.localeNames),
    [settings.locales, settings.localeNames],
  );
  const update = (next: LocalizationSettings) => onChange(normalize(next));

  return <div className="locale-settings-fields">
    <label>
      <span>Primary language</span>
      <select
        aria-label="Primary language"
        value={settings.primaryLocale}
        onChange={(event) => update({
          ...settings,
          primaryLocale: event.target.value,
          locales: [event.target.value, ...settings.locales.filter((locale) => locale !== event.target.value)],
        })}
      >
        {options.map((locale) => <option key={locale} value={locale}>{localeDisplayName(locale, settings.localeNames)}</option>)}
      </select>
    </label>

    <div className="locale-settings-list" aria-label="Additional languages">
      <span>Additional languages</span>
      {settings.locales.filter((locale) => locale !== settings.primaryLocale).length ? (
        <ul>
          {settings.locales.filter((locale) => locale !== settings.primaryLocale).map((locale) => <li key={locale}>
            <span>{localeDisplayName(locale, settings.localeNames)}</span>
            <button type="button" onClick={() => update({ ...settings, locales: settings.locales.filter((candidate) => candidate !== locale) })} aria-label={`Remove ${localeDisplayName(locale, settings.localeNames)}`}>Remove</button>
          </li>)}
        </ul>
      ) : <p>None yet.</p>}
      <select
        aria-label="Add a real language"
        value=""
        onChange={(event) => {
          if (!event.target.value) return;
          update({ ...settings, locales: [...settings.locales, event.target.value] });
        }}
      >
        <option value="">Add a real language…</option>
        {options.filter((locale) => !settings.locales.includes(locale)).map((locale) => <option key={locale} value={locale}>{localeDisplayName(locale, settings.localeNames)}</option>)}
      </select>
    </div>

    <div className="locale-invented-language">
      <label>
        <span>Invented language</span>
        <input
          aria-label="Invented language name"
          value={inventedLanguage}
          placeholder="e.g. Eldarin"
          onChange={(event) => setInventedLanguage(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
        />
      </label>
      <button
        type="button"
        disabled={!inventedLanguage.trim()}
        onClick={() => {
          const name = inventedLanguage.trim();
          const locale = customLocaleId(name, settings.locales);
          update({
            ...settings,
            locales: [...settings.locales, locale],
            localeNames: { ...settings.localeNames, [locale]: name },
          });
          setInventedLanguage("");
        }}
      >
        Add invented language
      </button>
    </div>
  </div>;
}
