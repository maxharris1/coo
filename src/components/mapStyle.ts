import type { StyleSpecification } from "maplibre-gl";

/** The flight map's own styles, served from public/map. */
export const MAP_STYLES = {
  day: "/map/coo-day.style.json",
  night: "/map/coo-night.style.json",
} as const;

/** OpenFreeMap's stock style: the loft picker, and the fallback if ours fails. */
export const STOCK_STYLE = "https://tiles.openfreemap.org/styles/liberty";

const isRootRelative = (url: string) =>
  url.startsWith("/") && !url.startsWith("//");

/**
 * MapLibre 6 rejects relative sprite urls, so a style that points at a sprite
 * in this app ("/map/sprite/coo") needs it made absolute against the page.
 */
export function absoluteSprites(
  style: StyleSpecification,
  origin: string,
): StyleSpecification {
  const absolute = (url: string) =>
    isRootRelative(url) ? new URL(url, origin).href : url;
  const { sprite } = style;
  if (sprite === undefined) return style;
  return {
    ...style,
    sprite:
      typeof sprite === "string"
        ? absolute(sprite)
        : sprite.map((s) => ({ ...s, url: absolute(s.url) })),
  };
}

export async function loadMapStyle(path: string): Promise<StyleSpecification> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Map style ${path} answered ${res.status}`);
  const style = (await res.json()) as StyleSpecification;
  return absoluteSprites(style, window.location.origin);
}
