import type { ReactNode } from "react";

export type SuiteSettings = {
  primaryFont: string;
  onPrimaryFontChange: (font: string) => void;
  style: string;
  onStyleChange: (style: string) => void;
  onToggleStyleMode: () => void;
};

export type SuiteChrome = {
  active: boolean;
  sharedUniversePath?: string;
  onHome?: () => void;
  renderAppSwitcher: () => ReactNode;
  suiteSettings?: SuiteSettings;
};
