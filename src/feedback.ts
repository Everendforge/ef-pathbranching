import packageJson from "../package.json";

const FEEDBACK_URL = import.meta.env.VITE_FEEDBACK_URL || "https://everend-forge-feedback.pages.dev/new";

export function feedbackUrl(screen: string) {
  const url = new URL(FEEDBACK_URL);
  url.searchParams.set("app", "pathbranching");
  url.searchParams.set("version", packageJson.version);
  url.searchParams.set("screen", screen);
  url.searchParams.set("platform", navigator.platform || "unknown");
  url.searchParams.set("timestamp", new Date().toISOString());
  return url.toString();
}
