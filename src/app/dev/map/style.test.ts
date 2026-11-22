import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import day from "../../../../public/map/coo-day.style.json";
import facts from "./liberty-facts.json";
import qa from "./qa-views.json";
import { PLACES, ZOOMS } from "./views";

type Layer = {
  id: string;
  type: string;
  source?: string;
  "source-layer"?: string;
  minzoom?: number;
  maxzoom?: number;
  filter?: unknown;
  layout?: Record<string, unknown>;
  paint?: Record<string, unknown>;
};

const layers = day.layers as Layer[];

const tokens = Object.fromEntries(
  [
    ...readFileSync("assets/tokens.css", "utf8").matchAll(
      /--coo-([a-z-]+):\s*(#[0-9A-Fa-f]{6})/g,
    ),
  ].map(([, name, hex]) => [name, hex.toUpperCase()]),
);

const COLOURS: Record<string, Record<string, string>> = {
  land: { "background-color": "paper" },
  urban: { "fill-color": "sand" },
  green: { "fill-color": "mint" },
  park: { "fill-color": "mint" },
  water: { "fill-color": "sky", "fill-outline-color": "ink" },
  shoreline: { "line-color": "ink" },
  "river-casing": { "line-color": "ink" },
  river: { "line-color": "sky" },
  building: { "fill-color": "card", "fill-outline-color": "ink" },
  "street-casing": { "line-color": "ink" },
  street: { "line-color": "card" },
  "road-casing": { "line-color": "ink" },
  road: { "line-color": "card" },
  border: { "line-color": "ink" },
  "water-name": { "text-color": "ink", "text-halo-color": "card" },
  "street-name": { "text-color": "ink", "text-halo-color": "card" },
  place: { "text-color": "ink", "text-halo-color": "card" },
  state: { "text-color": "ink", "text-halo-color": "card" },
};

const MIN_ZOOMS: Record<string, number> = {
  urban: 9,
  shoreline: 7,
  "street-casing": 13,
  street: 13,
  building: 15,
  "street-name": 15,
};

const byId = (id: string) => {
  const layer = layers.find((l) => l.id === id);
  if (!layer) throw new Error(`no layer ${id}`);
  return layer;
};

const classesIn = (filter: unknown): string[] => {
  if (!Array.isArray(filter)) return [];
  const [op, input, values] = filter;
  const isClass = JSON.stringify(input) === '["get","class"]';
  if (isClass && op === "match" && Array.isArray(values)) return values;
  if (isClass && op === "==" && typeof values === "string") return [values];
  return filter.flatMap(classesIn);
};

describe("day style against the stock OpenFreeMap style", () => {
  it("uses the stock sources, glyphs and sprite", () => {
    expect(day.sources).toEqual({
      openmaptiles: { ...facts.openmaptiles, maxzoom: 14 },
    });
    expect(day.glyphs).toBe(facts.glyphs);
    expect(day.sprite).toBe(facts.sprite);
  });

  it("caps the planet source at z14, the deepest tiles OpenFreeMap serves", () => {
    expect(day.sources.openmaptiles.maxzoom).toBe(14);
  });

  it("reads only source layers the tiles have", () => {
    for (const layer of layers.filter((l) => l.type !== "background")) {
      expect(layer.source, layer.id).toBe("openmaptiles");
      expect(facts.sourceLayers, layer.id).toContain(layer["source-layer"]);
    }
  });

  it("sets every label in a font stack the glyph server has", () => {
    const symbols = layers.filter((l) => l.type === "symbol");
    expect(symbols.length).toBeGreaterThan(0);
    for (const layer of symbols) {
      expect(facts.fontStacks, layer.id).toContainEqual(
        layer.layout?.["text-font"],
      );
    }
  });

  it("has unique layer ids", () => {
    const ids = layers.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("filters roads by OpenMapTiles road classes", () => {
    const known = [
      "motorway",
      "trunk",
      "primary",
      "secondary",
      "tertiary",
      "minor",
      "service",
    ];
    for (const layer of layers.filter((l) =>
      l["source-layer"]?.startsWith("transportation"),
    )) {
      const classes = classesIn(layer.filter);
      expect(classes.length, layer.id).toBeGreaterThan(0);
      for (const c of classes) expect(known, layer.id).toContain(c);
    }
  });
});

describe("day style colours", () => {
  it("colours each layer from the design tokens", () => {
    expect(layers.map((l) => l.id).sort()).toEqual(Object.keys(COLOURS).sort());
    for (const layer of layers) {
      const colours = Object.fromEntries(
        Object.entries(layer.paint ?? {}).filter(([prop]) =>
          prop.endsWith("-color"),
        ),
      );
      const expected = Object.fromEntries(
        Object.entries(COLOURS[layer.id]).map(([prop, token]) => [
          prop,
          tokens[token],
        ]),
      );
      expect(colours, layer.id).toEqual(expected);
    }
  });

  it("draws parks and green at 60% and the shoreline at 1.5 px", () => {
    expect(byId("park").paint?.["fill-opacity"]).toBe(0.6);
    expect(byId("green").paint?.["fill-opacity"]).toBe(0.6);
    expect(byId("shoreline").paint?.["line-width"]).toBe(1.5);
  });

  it("dashes the state borders", () => {
    expect(byId("border").paint?.["line-dasharray"]).toBeDefined();
  });
});

describe("day style zooms and sparseness", () => {
  it("starts each detail layer at its zoom", () => {
    for (const [id, zoom] of Object.entries(MIN_ZOOMS)) {
      expect(byId(id).minzoom, id).toBe(zoom);
    }
  });

  it("draws no points of interest, transit, house numbers or 3D", () => {
    const sourceLayers = layers.map((l) => l["source-layer"]);
    for (const banned of ["poi", "housenumber", "aerodrome_label"]) {
      expect(sourceLayers).not.toContain(banned);
    }
    expect(layers.map((l) => l.type)).not.toContain("fill-extrusion");
    for (const layer of layers) {
      expect(JSON.stringify(layer.filter ?? null), layer.id).not.toMatch(
        /rail|transit/,
      );
    }
  });
});

describe("day style at the representative QA views", () => {
  const FEATURE_TOKENS: Record<string, string[]> = {
    parks: ["mint"],
    "major-roads": ["card", "ink"],
    water: ["sky", "ink"],
  };

  it("covers parks, major roads and water at every place", () => {
    for (const feature of Object.keys(FEATURE_TOKENS)) {
      const places = qa.views
        .filter((v) => v.feature === feature)
        .map((v) => v.place);
      expect(new Set(places), feature).toEqual(
        new Set(PLACES.map((p) => p.id)),
      );
    }
  });

  it.each(qa.views)(
    "draws $feature at $place z$zoom in the token colours",
    ({ feature, place, zoom, layers: ids }) => {
      expect(PLACES.map((p) => p.id)).toContain(place);
      expect(ZOOMS).toContain(zoom);
      const allowed = FEATURE_TOKENS[feature].map((t) => tokens[t]);
      for (const id of ids) {
        const layer = byId(id);
        expect(layer.minzoom ?? 0, id).toBeLessThanOrEqual(zoom);
        expect(layer.maxzoom ?? 24, id).toBeGreaterThan(zoom);
        const colours = Object.entries(layer.paint ?? {}).filter(([prop]) =>
          prop.endsWith("-color"),
        );
        expect(colours.length, id).toBeGreaterThan(0);
        for (const [prop, value] of colours) {
          expect(allowed, `${id} ${prop}`).toContain(value);
        }
      }
    },
  );

  it("counts only motorways, trunks and primaries as major roads", () => {
    const ids = qa.views
      .filter((v) => v.feature === "major-roads")
      .flatMap((v) => v.layers);
    for (const id of new Set(ids)) {
      expect(classesIn(byId(id).filter).sort(), id).toEqual([
        "motorway",
        "primary",
        "trunk",
      ]);
    }
  });
});
