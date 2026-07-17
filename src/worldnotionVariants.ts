import type { CanonRef } from "./domain.js";

export const BASE_VARIANT_ID = "base";

export type CanonVariant = { id: string; label: string };

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function copy<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function merge(
  base: Record<string, unknown>,
  overrides: Record<string, unknown>,
) {
  const next = copy(base);
  Object.entries(overrides).forEach(([key, value]) => {
    const existing = record(next[key]);
    const nested = record(value);
    next[key] = existing && nested ? merge(existing, nested) : copy(value);
  });
  return next;
}

/** Reads the portable `variants` frontmatter extension while tolerating legacy notes. */
export function canonVariantsForRef(
  ref: Pick<CanonRef, "frontmatter">,
): CanonVariant[] {
  const raw = record(ref.frontmatter?.variants);
  const variants: CanonVariant[] = [];
  if (raw) {
    Object.entries(raw).forEach(([id, value]) => {
      const item = record(value);
      const label = typeof item?.label === "string" ? item.label.trim() : "";
      if (/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id) && label)
        variants.push({ id, label });
    });
  }
  const base = variants.find((variant) => variant.id === BASE_VARIANT_ID);
  return [
    base ?? { id: BASE_VARIANT_ID, label: "Base variant" },
    ...variants.filter((variant) => variant.id !== BASE_VARIANT_ID),
  ];
}

export function resolveCanonVariantId(
  ref: Pick<CanonRef, "frontmatter">,
  candidate?: string,
) {
  return canonVariantsForRef(ref).some((variant) => variant.id === candidate)
    ? candidate!
    : BASE_VARIANT_ID;
}

/** Returns frontmatter as it should be presented for a speech beat's selected variant. */
export function resolveCanonVariantFrontmatter(
  ref: Pick<CanonRef, "frontmatter">,
  candidate?: string,
): Record<string, unknown> {
  const frontmatter = copy(ref.frontmatter ?? {});
  const variants = record(frontmatter.variants);
  delete frontmatter.variants;
  const variantId = resolveCanonVariantId(ref, candidate);
  if (variantId === BASE_VARIANT_ID) return frontmatter;
  const variant = record(variants?.[variantId]);
  const overrides = record(variant?.overrides);
  return overrides ? merge(frontmatter, overrides) : frontmatter;
}
