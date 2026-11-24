import { readFileSync, writeFileSync } from "node:fs";
import { VectorTile, VectorTileFeature } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { PLACES } from "./views.ts";

export const TILEJSON_URL = "https://tiles.openfreemap.org/planet";
const FACTS_PATH = "src/app/dev/map/liberty-facts.json";
const SAMPLES_PATH = "src/app/dev/map/tile-samples.json";

export const FACT_PLACES = [
  ...PLACES.map(({ id, center }) => ({ id, center })),
  { id: "adirondacks", center: [-73.92, 44.11] },
  { id: "colorado", center: [-106, 39.5] },
] as const;
export const FACT_ZOOMS = [3, 6, 9, 12, 14] as const;
export const SAMPLE_ZOOMS = [3, 6, 9, 12] as const;
export const MAX_FEATURES = 20;

export const DECORATIONS = {
  "water-waves": "water",
  "woods-trees": "landcover",
  mountains: "mountain_peak",
  place: "place",
} as const;

type Props = Record<string, string | number | boolean>;
type GeometryType = "Point" | "LineString" | "Polygon";
export type Feature = Props & { type: GeometryType };
type TileLayers = Record<string, Feature[]>;
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

function placeTiles(zooms: readonly number[]) {
  return FACT_PLACES.flatMap((place) =>
    zooms.map((zoom) => ({
      place: place.id,
      ...tileAt(place.center, zoom),
    })),
  );
}

export const factTiles = () => placeTiles(FACT_ZOOMS);

export function sampleTiles() {
  const [newYork] = PLACES;
  return [
    ...placeTiles(SAMPLE_ZOOMS),
    { place: newYork.id, ...tileAt(newYork.center, 11) },
  ];
}

function geometryType(feature: VectorTileFeature): GeometryType {
  const type = VectorTileFeature.types[feature.type];
  if (type === "Unknown") throw new Error("feature has no geometry type");
  return type;
}

export function decodeTile(buf: Uint8Array): TileLayers {
  const tile = new VectorTile(new PbfReader(buf));
  return Object.fromEntries(
    Object.entries(tile.layers).map(([name, layer]) => [
      name,
      Array.from({ length: layer.length }, (_, i) => {
        const feature = layer.feature(i);
        return {
          type: geometryType(feature),
          ...Object.fromEntries(
            Object.entries(feature.properties).filter(
              ([key]) => !LOCALIZED_NAME.test(key),
            ),
          ),
        };
      }),
    ]),
  );
}

export function sourceLayerFacts(
  tilejson: TileJSON,
  tiles: Record<string, Props[]>[],
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

export function pick<T extends Props>(features: T[], max = MAX_FEATURES): T[] {
  if (features.length <= max) return features;
  const rank = (f: T) =>
    typeof f.rank === "number" ? f.rank : Number.MAX_VALUE;
  const sorted = [...features].sort((a, b) => rank(a) - rank(b));
  const classes = new Set<unknown>();
  const firstOfClass = sorted.filter(
    (f) => !classes.has(f.class) && classes.add(f.class),
  );
  const picked = new Set(firstOfClass.slice(0, max));
  for (const f of sorted) if (picked.size < max) picked.add(f);
  return sorted.filter((f) => picked.has(f));
}

export function samples(
  tiles: { place: string; zoom: number; layers: TileLayers }[],
) {
  return Object.entries(DECORATIONS).flatMap(([layer, sourceLayer]) =>
    tiles.map(({ place, zoom, layers }) => ({
      layer,
      place,
      zoom,
      features: pick(layers[sourceLayer] ?? []),
    })),
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
  const key = ({ z, x, y }: { z: number; x: number; y: number }) =>
    `${z}/${x}/${y}`;
  const unique = new Map(
    [...factTiles(), ...sampleTiles()].map((t) => [key(t), t]),
  );
  const decoded = new Map(
    await Promise.all(
      [...unique].map(async ([k, { z, x, y }]) => {
        const url = template
          .replace("{z}", `${z}`)
          .replace("{x}", `${x}`)
          .replace("{y}", `${y}`);
        const buf = await (await fetchOk(url)).arrayBuffer();
        return [k, decodeTile(new Uint8Array(buf))] as const;
      }),
    ),
  );
  const layersAt = (t: Parameters<typeof key>[0]) => decoded.get(key(t))!;
  const tiles = factTiles().map(layersAt);
  const fetched = {
    date: new Date().toLocaleDateString("en-CA"),
    version: tilejson.version,
    tiles: template,
  };
  const sourceLayers = sourceLayerFacts(tilejson, tiles);
  const facts = JSON.parse(readFileSync(FACTS_PATH, "utf8"));
  writeFileSync(
    FACTS_PATH,
    formatFacts({
      ...facts,
      tilejson: TILEJSON_URL,
      tilesFetched: fetched,
      sourceLayers,
    }),
  );
  const sampled = samples(
    sampleTiles().map((t) => ({
      place: t.place,
      zoom: t.z,
      layers: layersAt(t),
    })),
  );
  writeFileSync(
    SAMPLES_PATH,
    `{\n  "tilejson": ${JSON.stringify(TILEJSON_URL)},\n  "fetched": ${JSON.stringify(fetched)},\n  "samples": [\n` +
      sampled.map((s) => `    ${JSON.stringify(s)}`).join(",\n") +
      "\n  ]\n}\n",
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
  const counts = Map.groupBy(sampled, (s) => `${s.layer} ${s.place}`);
  process.stdout.write(
    `${sampled.length} samples from ${unique.size} tiles, features per zoom:\n` +
      [...counts]
        .map(
          ([id, list]) =>
            `  ${id}: ${list.map((s) => `z${s.zoom} ${s.features.length}`).join(", ")}\n`,
        )
        .join(""),
  );
}
