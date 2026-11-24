import type { StyleSpecification } from "maplibre-gl";

export function absoluteSprites(
  style: StyleSpecification,
  origin: string,
): StyleSpecification {
  const absolute = (url: string) =>
    url.startsWith("/") ? new URL(url, origin).href : url;
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
  if (!res.ok) throw new Error(`map style ${path}: ${res.status}`);
  return absoluteSprites(await res.json(), window.location.origin);
}
