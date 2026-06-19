export type ThemeFamily = "worldnotion" | "github" | "one" | "dracula" | "owl" | "material";
export type ThemeMode = "light" | "dark";

export type ThemeId =
  | "worldnotion-light"
  | "worldnotion-dark"
  | "github"
  | "github-dark"
  | "one-light-pro"
  | "one-dark-pro"
  | "dracula-light"
  | "dracula"
  | "light-owl"
  | "night-owl"
  | "material-lighter"
  | "material-palenight";

export type ThemeDefinition = {
  id: ThemeId;
  label: string;
  isDark: boolean;
  family: ThemeFamily;
  mode: ThemeMode;
};

export const THEMES: ThemeDefinition[] = [
  { id: "worldnotion-light", label: "WorldNotion Light", isDark: false, family: "worldnotion", mode: "light" },
  { id: "worldnotion-dark", label: "WorldNotion Dark", isDark: true, family: "worldnotion", mode: "dark" },
  { id: "github", label: "GitHub Light", isDark: false, family: "github", mode: "light" },
  { id: "github-dark", label: "GitHub Dark", isDark: true, family: "github", mode: "dark" },
  { id: "one-light-pro", label: "One Light Pro", isDark: false, family: "one", mode: "light" },
  { id: "one-dark-pro", label: "One Dark Pro", isDark: true, family: "one", mode: "dark" },
  { id: "dracula-light", label: "Dracula Light", isDark: false, family: "dracula", mode: "light" },
  { id: "dracula", label: "Dracula", isDark: true, family: "dracula", mode: "dark" },
  { id: "light-owl", label: "Light Owl", isDark: false, family: "owl", mode: "light" },
  { id: "night-owl", label: "Night Owl", isDark: true, family: "owl", mode: "dark" },
  { id: "material-lighter", label: "Material Lighter", isDark: false, family: "material", mode: "light" },
  { id: "material-palenight", label: "Material Palenight", isDark: true, family: "material", mode: "dark" },
];

export const THEME_IDS = THEMES.map((theme) => theme.id);

export function normalizeThemeId(value: unknown): ThemeId {
  if (value === "light") {
    return "worldnotion-light";
  }
  if (value === "dark") {
    return "worldnotion-dark";
  }
  return THEME_IDS.includes(value as ThemeId) ? (value as ThemeId) : "worldnotion-light";
}

export function themeById(themeId: ThemeId) {
  return THEMES.find((theme) => theme.id === themeId) ?? THEMES[0];
}

export function isDarkTheme(themeId: ThemeId) {
  return themeById(themeId).isDark;
}

export function themeForFamilyAndMode(family: ThemeFamily, mode: ThemeMode): ThemeId {
  return THEMES.find((theme) => theme.family === family && theme.mode === mode)?.id ?? "worldnotion-light";
}

export function toggledThemeMode(themeId: ThemeId): ThemeId {
  const current = themeById(themeId);
  return themeForFamilyAndMode(current.family, current.mode === "dark" ? "light" : "dark");
}
