import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Page } from "@playwright/test";
import { BANNER_HEIGHT_VAR } from "@/app/OfflineBanner";
import { CSS_MODULES, prefixOf, readRepoFile, scopeCss } from "./cssModules";

const ROOT = new URL("../../", import.meta.url);

const GLOBAL_CSS = [
  "public/assets/tokens.css",
  "public/assets/motion.css",
  "src/components/flight.css",
  "src/app/globals.css",
  "node_modules/maplibre-gl/dist/maplibre-gl.css",
];

export const ORIGIN = "http://coo.test";

export type Insets = { top: number; bottom: number };

function withInsets(css: string, { top, bottom }: Insets) {
  return css
    .replace(/env\(safe-area-inset-top, 0px\)/g, `${top}px`)
    .replace(/env\(safe-area-inset-bottom, 0px\)/g, `${bottom}px`)
    .replace(/env\(safe-area-inset-(?:left|right), 0px\)/g, "0px");
}

const MAP_STYLE = {
  version: 8,
  sources: {
    base: {
      type: "raster",
      tiles: [`${ORIGIN}/tiles/{z}/{x}/{y}.png`],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors",
    },
  },
  layers: [{ id: "base", type: "raster", source: "base" }],
};

export function fixtureHtml({
  body,
  mapClass,
  insets,
  mapStyle = MAP_STYLE,
}: {
  body: ReactNode;
  mapClass: string;
  insets: Insets;
  mapStyle?: unknown;
}): string {
  const css = [
    ...GLOBAL_CSS.map(readRepoFile),
    ...CSS_MODULES.map((m) => scopeCss(readRepoFile(m), prefixOf(m))),
  ].join("\n");
  const banner = JSON.stringify(BANNER_HEIGHT_VAR);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<style>${withInsets(css, insets)}</style>
</head>
<body>
${renderToStaticMarkup(body)}
<script type="module">
  import * as maplibregl from "${ORIGIN}/maplibre-gl.mjs";
  maplibregl.setWorkerUrl("${ORIGIN}/maplibre-gl-worker.mjs");
  const banner = document.querySelector("p[role=status]");
  if (banner) {
    document.body.style.setProperty(
      ${banner},
      banner.getBoundingClientRect().height + "px",
    );
  }
  const style = ${JSON.stringify(mapStyle)};
  for (const container of document.querySelectorAll(
    ${JSON.stringify(`.${mapClass} > div > div:first-child`)},
  )) {
    new maplibregl.Map({
      container,
      style,
      center: [-73.97, 40.68],
      zoom: 10,
      minZoom: 3,
      maxZoom: 17,
      attributionControl: { compact: true },
    });
  }
</script>
</body>
</html>`;
}

const TYPES: Record<string, string> = {
  mjs: "text/javascript",
  css: "text/css",
  svg: "image/svg+xml",
  woff2: "font/woff2",
  png: "image/png",
  json: "application/json",
};

export async function serve(page: Page, html: string) {
  await page.route(`${ORIGIN}/**`, (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === "/") {
      return route.fulfill({ body: html, contentType: "text/html" });
    }
    const file = /^\/maplibre-gl[\w-]*\.mjs$/.test(path)
      ? `node_modules/maplibre-gl/dist${path}`
      : path.startsWith("/assets/")
        ? `public${path}`
        : null;
    if (!file) return route.fulfill({ status: 404 });
    return route.fulfill({
      body: readFileSync(new URL(file, ROOT)),
      contentType:
        TYPES[path.replace(/^.*\./, "")] ?? "application/octet-stream",
    });
  });
  await page.goto(`${ORIGIN}/`);
  await page.waitForSelector(".maplibregl-ctrl-attrib-button");
  await page.evaluate(() => document.fonts.ready);
}
