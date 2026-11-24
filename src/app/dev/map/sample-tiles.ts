import { readFileSync, writeFileSync } from "node:fs";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PLACES } from "./views.ts";

export const TILEJSON_URL = "https://tiles.openfreemap.org/planet";
const FACTS_PATH = "src/app/dev/map/liberty-facts.json";

export const FACT_PLACES = [
  ...PLACES.map(({ id, center }) => ({ id, center })),
  { id: "adirondacks", center: [-73.92, 44.11] },
  { id: "colorado", center: [-106, 39.5] },
] as const;
export const FACT_ZOOMS = [3, 6, 9, 12, 14] as const;

type Props = Record<string, string | number | boolean>;
type TileLayers = Record<string, Props[]>;
export type TileJSON = {
  version?: string;
  tiles?: string[];
  vector_layers: { id: string; fields: Record<string, string> }[];
};
export type SourceLayerFacts = { fields: string[]; classes: string[] };

const LOCALIZED_NAME = /^name:.+/;

export function tileAt([lon, lat]: readonly number[], z: number) {
  const n = 2 ** z;
  const rad = (lat * Math.PI) / 180;
  return {
    z,
    x: Math.floor(((lon + 180) / 360) * n),
    y: Math.floor(((1 - Math.asinh(Math.tan(rad)) / Math.PI) / 2) * n),
  };
}

export function factTiles() {
  return FACT_PLACES.flatMap((place) =>
    FACT_ZOOMS.map((zoom) => ({
      place: place.id,
      ...tileAt(place.center, zoom),
    })),
  );
}

export function decodeTile(buf: Uint8Array): TileLayers {
  const tile = new VectorTile(new PbfReader(buf));
  return Object.fromEntries(
    Object.entries(tile.layers).map(([name, layer]) => [
      name,
      Array.from({ length: layer.length }, (_, i) =>
        Object.fromEntries(
          Object.entries(layer.feature(i).properties).filter(
            ([key]) => !LOCALIZED_NAME.test(key),
          ),
        ),
      ),
    ]),
  );
}

export function sourceLayerFacts(
  tilejson: TileJSON,
  tiles: TileLayers[],
): Record<string, SourceLayerFacts> {
  return Object.fromEntries(
    tilejson.vector_layers.map(({ id, fields }) => {
      const names = Object.keys(fields).map((f) =>
        LOCALIZED_NAME.test(f) ? "name:*" : f,
      );
      const classes = tiles.flatMap((t) =>
        (t[id] ?? []).flatMap((p) =>
          typeof p.class === "string" ? [p.class] : [],
        ),
      );
      return [
        id,
        {
          fields: [...new Set(names)].sort(),
          classes: [...new Set(classes)].sort(),
        },
      ];
    }),
  );
}

function formatFacts(facts: Record<string, unknown>): string {
  const lines = Object.entries(facts).map(([key, value]) => {
    if (key !== "sourceLayers") return `  "${key}": ${JSON.stringify(value)}`;
    const layers = Object.entries(value as Record<string, unknown>).map(
      ([id, layer]) => `    "${id}": ${JSON.stringify(layer)}`,
    );
    return `  "sourceLayers": {\n${layers.join(",\n")}\n  }`;
  });
  return `{\n${lines.join(",\n")}\n}\n`;
}

async function fetchOk(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

if (import.meta.main) {
  const tilejson: TileJSON = await (await fetchOk(TILEJSON_URL)).json();
  const template = tilejson.tiles?.[0];
  if (!template) throw new Error(`${TILEJSON_URL} lists no tiles`);
  const tiles = await Promise.all(
    factTiles().map(async ({ z, x, y }) => {
      const url = template
        .replace("{z}", `${z}`)
        .replace("{x}", `${x}`)
        .replace("{y}", `${y}`);
      return decodeTile(
        new Uint8Array(await (await fetchOk(url)).arrayBuffer()),
      );
    }),
  );
  const sourceLayers = sourceLayerFacts(tilejson, tiles);
  const facts = JSON.parse(readFileSync(FACTS_PATH, "utf8"));
  writeFileSync(
    FACTS_PATH,
    formatFacts({
      ...facts,
      tilejson: TILEJSON_URL,
      tilesFetched: {
        date: new Date().toLocaleDateString("en-CA"),
        version: tilejson.version,
        tiles: template,
      },
      sourceLayers,
    }),
  );
  process.stdout.write(
    `TileJSON ${tilejson.version}: ${Object.keys(sourceLayers).length} source layers from ${tiles.length} tiles\n` +
      Object.entries(sourceLayers)
        .map(
          ([id, l]) =>
            `  ${id}: ${l.fields.length} fields, ${l.classes.length} classes\n`,
        )
        .join(""),
  );
}
