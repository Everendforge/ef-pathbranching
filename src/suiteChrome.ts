import type { ReactNode } from "react";
import type { LocalePreference } from "./i18n";

export type SuiteLicenseStatus = "idle" | "activating" | "active" | "inactive" | "error";

export type SuiteLicenseInstance = {
  id: string;
  name: string;
  createdAt?: string;
  updatedAt?: string;
};

export type SuiteLicenseControls = {
  status: SuiteLicenseStatus;
  licenseKey?: string;
  instanceName?: string;
  currentInstanceId?: string;
  activationUsage?: number;
  activationLimit?: number;
  error?: string;
  instances?: SuiteLicenseInstance[];
  devicesStatus?: "idle" | "loading" | "error";
  devicesError?: string;
  onActivate: (licenseKey: string) => void;
  onValidate: () => void;
  onDeactivate: () => void;
  onLoadDevices: () => void;
  onDeactivateDevice: (instanceId: string) => void;
};

export type SuiteSettings = {
  localePreference: LocalePreference;
  locale: "en" | "es";
  onLocalePreferenceChange: (preference: LocalePreference) => void;
  primaryFont: string;
  onPrimaryFontChange: (font: string) => void;
  style: string;
  onStyleChange: (style: string) => void;
  onToggleStyleMode: () => void;
  update: SuiteUpdateControls;
  license: SuiteLicenseControls;
};

export type SuiteUpdateStatus =
  | "idle"
  | "checking"
  | "up-to-date"
  | "available"
  | "downloading"
  | "error";

export type SuiteUpdateControls = {
  appName: string;
  currentVersion: string;
  identifier: string;
  platform: string;
  status: SuiteUpdateStatus;
  availableVersion?: string;
  releaseNotes?: string;
  progress?: number;
  downloadedBytes?: number;
  contentLength?: number;
  lastCheckedAt?: string;
  error?: string;
  onCheck: () => void;
  onInstall: () => void;
};

export type SuiteChrome = {
  active: boolean;
  sharedUniversePath?: string;
  onReady?: () => void;
  onHome?: () => void;
  onReload?: () => void;
  renderAppSwitcher: () => ReactNode;
  suiteSettings?: SuiteSettings;
};
