import {
  resolveLocale,
  setDocumentLocale,
  type Locale,
  type LocalePreference,
} from "./localePolicy";

export { normalizeLocalePreference } from "./localePolicy";
export type { Locale, LocalePreference };

export function resolveInterfaceLocale(preference: LocalePreference): Locale {
  return resolveLocale(preference);
}

export function applyInterfaceLocale(preference: LocalePreference): Locale {
  const locale = resolveInterfaceLocale(preference);
  setDocumentLocale(locale);
  return locale;
}

const copy = {
  en: { interfaceLanguage: "Interface language", system: "System default" },
  es: { interfaceLanguage: "Idioma de la interfaz", system: "Predeterminado del sistema" },
} as const;

export function interfaceLocaleCopy(locale: Locale) {
  return copy[locale];
}

const settingsCopy = {
  en: { forge: "Forge", suite: "Suite", update: "Update", universe: "Universe", overview: "Overview", authoring: "Branching", markdown: "Markdown", bridge: "Bridge", application: "Application", workspace: "Workspace", recents: "Recents", tutorials: "Tutorials", suiteTitle: "Everend Forge Suite", suiteDescription: "Shared preferences applied to every app in this Suite.", style: "Style", typeface: "Primary typeface", updateTitle: "Everend Forge Update", updateDescription: "Check, download, and install signed updates for the Suite.", installedVersion: "Installed version", platform: "Platform", applicationId: "Application ID", checking: "Checking for updates...", available: "Version {{version}} is ready", downloading: "Installing Everend Forge {{version}}...", upToDate: "You are up to date", failed: "Update check failed", ready: "Ready to check for updates", updaterReady: "The updater is ready to contact the release server.", check: "Check for updates", install: "Download and install" },
  es: { forge: "Forge", suite: "Suite", update: "Actualización", universe: "Universo", overview: "Resumen", authoring: "Ramificación", markdown: "Markdown", bridge: "Puente", application: "Aplicación", workspace: "Espacio de trabajo", recents: "Recientes", tutorials: "Tutoriales", suiteTitle: "Everend Forge Suite", suiteDescription: "Preferencias compartidas que se aplican a todas las apps de esta Suite.", style: "Estilo", typeface: "Tipografía principal", updateTitle: "Actualización de Everend Forge", updateDescription: "Comprueba, descarga e instala actualizaciones firmadas de la Suite.", installedVersion: "Versión instalada", platform: "Plataforma", applicationId: "ID de aplicación", checking: "Comprobando actualizaciones...", available: "La versión {{version}} está lista", downloading: "Instalando Everend Forge {{version}}...", upToDate: "Estás al día", failed: "La comprobación de actualización falló", ready: "Listo para comprobar actualizaciones", updaterReady: "El actualizador está listo para contactar el servidor de versiones.", check: "Comprobar actualizaciones", install: "Descargar e instalar" },
} as const;

export function pathbranchingSettingsCopy(locale: Locale) {
  return settingsCopy[locale];
}
