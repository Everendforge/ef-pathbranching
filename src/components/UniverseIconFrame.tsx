import { BookOpen, Castle, Globe2, Sparkles } from "lucide-react";
import type { UniverseProfile } from "../pathBranchingWorkspace.js";

export function UniverseIconFrame({ profile, size = 28 }: { profile?: UniverseProfile; size?: number }) {
  const icon = profile?.icon;
  if (icon?.type === "image" && icon.value) {
    return (
      <span className="pathbranching-universe-icon" style={{ width: size, height: size }}>
        <img src={icon.value} alt="" />
      </span>
    );
  }

  const preset = icon?.value ?? "book";
  const iconSize = Math.max(16, Math.round(size * 0.56));
  const Icon =
    preset === "globe"
      ? Globe2
      : preset === "castle"
        ? Castle
        : preset === "sparkles"
          ? Sparkles
          : BookOpen;

  return (
    <span className="pathbranching-universe-icon" style={{ width: size, height: size }}>
      <Icon size={iconSize} />
    </span>
  );
}
