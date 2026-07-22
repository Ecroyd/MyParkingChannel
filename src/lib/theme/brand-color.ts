import type { CSSProperties } from "react";

/** Resolve accessible foreground for a tenant brand colour. */
export function normalizeHexColor(input: string | null | undefined, fallback = "#0f172a"): string {
  if (!input || typeof input !== "string") return fallback;
  let hex = input.trim();
  if (hex.startsWith("rgb")) return fallback;
  if (!hex.startsWith("#")) hex = `#${hex}`;
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    hex = `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`;
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return fallback;
  return hex.toLowerCase();
}

function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = [r, g, b].map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  );
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}

/** White or near-black text for sufficient contrast on brand fills. */
export function contrastingForeground(bgHex: string | null | undefined): "#ffffff" | "#0f172a" {
  const hex = normalizeHexColor(bgHex, "#0f172a");
  return luminance(hex) > 0.45 ? "#0f172a" : "#ffffff";
}

export function tenantThemeStyle(args: {
  primary?: string | null;
  secondary?: string | null;
}): CSSProperties {
  const primary = normalizeHexColor(args.primary, "#0f172a");
  const secondary = normalizeHexColor(args.secondary, "#0284c7");
  return {
    ["--tenant-primary" as string]: primary,
    ["--tenant-primary-fg" as string]: contrastingForeground(primary),
    ["--tenant-secondary" as string]: secondary,
    ["--tenant-secondary-fg" as string]: contrastingForeground(secondary),
    ["--tenant-action" as string]: primary,
    ["--tenant-action-fg" as string]: contrastingForeground(primary),
    ["--tenant-footer-bg" as string]: "#0b1220",
    ["--tenant-line" as string]: "#e2e8f0",
  };
}
