import { existsSync } from "node:fs";
import {
  createPropertyExpression,
  featureFilter,
  latest,
  validateStyleMin,
  type FilterSpecification,
  type StylePropertySpecification,
  type StyleSpecification,
} from "@maplibre/maplibre-gl-style-spec";
import { describe, expect, it } from "vitest";
import colours from "../../../../assets/map/map-colours.json";
import day from "../../../../public/map/coo-day.style.json";
import sprite from "../../../../public/map/sprite/coo.json";
import facts from "./liberty-facts.json";
import qa from "./qa-views.json";
import samples from "./tile-samples.json";
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
const { regional, street } = colours;
const INK = regional.label;
const CREAM = regional.halo;
const blend = (from: string, to: string) => [
  "interpolate",
  ["linear"],
  ["zoom"],
  12,
  from,
  14,
  to,
];

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

/** Every value a `match` on `field` compares against, anywhere in `expr`. */
const matchedValues = (expr: unknown, field: string): string[] => {
  if (!Array.isArray(expr)) return [];
  const [op, input, ...rest] = expr;
  const found = expr.flatMap((e) => matchedValues(e, field));
  if (JSON.stringify(input) !== JSON.stringify(["get", field])) return found;
  if (op === "==" && typeof rest[0] === "string") return [rest[0], ...found];
  if (op !== "match") return found;
  const labels = rest.slice(0, -1).filter((_, i) => i % 2 === 0);
  return [...labels.flat(), ...found];
};

/** Every field a layer reads with ["get", field]. */
const fieldsIn = (expr: unknown): string[] =>
  !Array.isArray(expr)
    ? []
    : expr[0] === "get" && typeof expr[1] === "string"
      ? [expr[1]]
      : expr.flatMap(fieldsIn);

const spec = (layer: Layer, section: "paint" | "layout", prop: string) =>
  (latest as unknown as Record<string, Record<string, unknown>>)[
    `${section}_${layer.type}`
  ][prop] as StylePropertySpecification;

/** Evaluates a paint or layout value at a zoom for one feature. */
function evaluate(
  layer: Layer,
  section: "paint" | "layout",
  prop: string,
  zoom: number,
  properties: Record<string, unknown> = {},
) {
  const value = layer[section]?.[prop];
  const parsed = createPropertyExpression(
    value,
    `${layer.id}.${prop}`,
    spec(layer, section, prop),
  );
  if (parsed.result !== "success") {
    throw new Error(`${layer.id} ${prop}: ${JSON.stringify(parsed.value)}`);
  }
  return parsed.value.evaluate({ zoom }, { type: 2, properties } as never);
}

describe("day style against the stock OpenFreeMap style", () => {
  it("uses the stock sources and glyphs, and the stock sprite beside ours", () => {
    expect(day.sources).toEqual({
      openmaptiles: { ...facts.openmaptiles, maxzoom: 14 },
    });
    expect(day.glyphs).toBe(facts.glyphs);
    expect(day.sprite).toEqual([
      { id: "default", url: facts.sprite },
      { id: "coo", url: "/map/sprite/coo" },
    ]);
    for (const file of ["coo.json", "coo.png", "coo@2x.json", "coo@2x.png"]) {
      expect(existsSync(`public/map/sprite/${file}`), file).toBe(true);
    }
  });

  it("passes the MapLibre style validator once the sprite is absolute", () => {
    const style = structuredClone(day) as unknown as StyleSpecification;
    style.sprite = [
      { id: "default", url: facts.sprite },
      { id: "coo", url: "https://coo.example/map/sprite/coo" },
    ];
    expect(validateStyleMin(style)).toEqual([]);
  });

  it("caps the planet source at z14, the deepest tiles OpenFreeMap serves", () => {
    expect(day.sources.openmaptiles.maxzoom).toBe(14);
  });

  it("reads only source layers and fields the tiles have", () => {
    for (const layer of layers.filter((l) => l.type !== "background")) {
      expect(layer.source, layer.id).toBe("openmaptiles");
      const sourceLayer = layer[
        "source-layer"
      ] as keyof typeof facts.sourceLayers;
      expect(Object.keys(facts.sourceLayers), layer.id).toContain(sourceLayer);
      const { fields } = facts.sourceLayers[sourceLayer];
      const read = fieldsIn([layer.filter, layer.layout, layer.paint]);
      for (const field of read) {
        expect([...fields, "name:en"], `${layer.id} reads ${field}`).toContain(
          field,
        );
      }
    }
  });

  it("matches only class values seen on the live tiles", () => {
    for (const layer of layers.filter((l) => l["source-layer"])) {
      const sourceLayer = layer[
        "source-layer"
      ] as keyof typeof facts.sourceLayers;
      const known = facts.sourceLayers[sourceLayer].classes;
      for (const c of matchedValues(layer.filter, "class")) {
        expect(known, `${layer.id} class ${c}`).toContain(c);
      }
    }
  });

  it("uses only sprite images that exist", () => {
    const names = Object.keys(sprite).map((n) => `coo:${n}`);
    const images = layers.flatMap((l) =>
      [l.layout?.["icon-image"], l.paint?.["fill-pattern"]]
        .flat(2)
        .filter(
          (v): v is string => typeof v === "string" && v.startsWith("coo:"),
        ),
    );
    expect(images.length).toBeGreaterThan(5);
    for (const image of images) expect(names, image).toContain(image);
  });

  it("records mountain peaks with their class values from the live tiles", () => {
    const peaks = facts.sourceLayers.mountain_peak;
    expect(peaks.fields).toEqual(
      expect.arrayContaining(["class", "ele", "rank"]),
    );
    expect(peaks.classes).toContain("peak");
  });

  it("sets every label in a font stack the glyph server has", () => {
    const symbols = layers.filter((l) => l.layout?.["text-field"]);
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

describe("day style colours (STYLE.md section 2)", () => {
  const COLOURS: Record<string, Record<string, unknown>> = {
    land: { "background-color": regional.land },
    urban: { "fill-color": blend(regional.urban, street.block) },
    green: { "fill-color": regional.woods },
    "city-park": { "fill-color": blend(regional.park, street.park) },
    park: { "fill-color": blend(regional.park, street.park) },
    "park-outline": { "line-color": street.parkLine },
    water: { "fill-color": regional.water, "fill-outline-color": INK },
    shoreline: { "line-color": regional.waterLine },
    "river-casing": { "line-color": regional.riverCasing },
    river: { "line-color": regional.river },
    building: {
      "fill-color": street.block,
      "fill-outline-color": "rgba(42,33,64,0.3)",
    },
    "street-casing": { "line-color": street.streetCasing },
    street: { "line-color": street.street },
    "road-casing": { "line-color": regional.roadCasing },
    road: { "line-color": regional.road },
    border: { "line-color": regional.border },
    "state-border": { "line-color": regional.border },
    "water-waves": {},
    "woods-trees": {},
    "park-trees": {},
    "city-park-trees": {},
    mountains: {},
    "water-name": { "text-color": INK, "text-halo-color": CREAM },
    "street-name": { "text-color": INK, "text-halo-color": CREAM },
    "park-name": { "text-color": INK, "text-halo-color": CREAM },
    shops: { "text-color": INK },
    place: { "text-color": INK, "text-halo-color": CREAM },
    state: { "text-color": INK, "text-halo-color": CREAM },
  };

  it("colours each layer from assets/map/map-colours.json", () => {
    expect(layers.map((l) => l.id).sort()).toEqual(Object.keys(COLOURS).sort());
    for (const layer of layers) {
      const colours = Object.fromEntries(
        Object.entries(layer.paint ?? {}).filter(([prop]) =>
          prop.endsWith("-color"),
        ),
      );
      expect(colours, layer.id).toEqual(COLOURS[layer.id]);
    }
  });

  it("blends regional into street colours between zoom 12 and 14", () => {
    const urban = byId("urban");
    expect(evaluate(urban, "paint", "fill-color", 12).toString()).toBe(
      "rgba(255,233,191,1)",
    );
    expect(evaluate(urban, "paint", "fill-color", 14).toString()).toBe(
      "rgba(255,226,168,1)",
    );
    const mid = evaluate(urban, "paint", "fill-color", 13).toString();
    expect(mid).not.toBe("rgba(255,233,191,1)");
    expect(mid).not.toBe("rgba(255,226,168,1)");
  });

  it("outlines water in ink, 1.5 pt growing to 2.5 pt by zoom 12", () => {
    const shore = byId("shoreline");
    expect(evaluate(shore, "paint", "line-width", 5)).toBe(1.5);
    expect(evaluate(shore, "paint", "line-width", 12)).toBe(2.5);
  });

  it("dashes the state borders in ink at 40% and hides them above zoom 11", () => {
    const states = byId("state-border");
    expect(states.paint).toMatchObject({
      "line-opacity": regional.borderOpacity,
      "line-width": 1.4,
      "line-dasharray": [3, 3],
    });
    expect(states.maxzoom).toBe(11);
    expect(classesIn(states.filter)).toEqual([]);
    expect(JSON.stringify(byId("border").filter)).toContain(
      '["==",["get","admin_level"],2]',
    );
  });

  it("covers the water, not rivers or pools, with the squiggle tile", () => {
    const waves = byId("water-waves");
    expect(waves.paint).toEqual({ "fill-pattern": "coo:wave-pattern" });
    expect(classesIn(waves.filter).sort()).toEqual(["lake", "ocean", "pond"]);
  });
});

describe("day style labels (STYLE.md section 5)", () => {
  it("spells state names in spaced capitals at half ink", () => {
    const state = byId("state");
    expect(state.layout).toMatchObject({
      "text-letter-spacing": 0.22,
      "text-max-width": 8,
      "text-font": ["Noto Sans Bold"],
    });
    expect(state.layout?.["text-field"]).toEqual([
      "upcase",
      ["coalesce", ["get", "name:en"], ["get", "name"]],
    ]);
    expect(state.paint?.["text-opacity"]).toBe(regional.stateLabelOpacity);
    expect(evaluate(state, "layout", "text-size", 4)).toBe(10);
    expect(evaluate(state, "layout", "text-size", 8)).toBe(12);
    expect(state.maxzoom).toBe(8);
  });

  it("labels Canadian provinces like US states", () => {
    const state = featureFilter(
      byId("state").filter as FilterSpecification,
      "state.filter",
    );
    const shows = (cls: string, zoom: number) =>
      state.filter({ zoom }, { type: 1, properties: { class: cls } } as never);
    expect(shows("state", 6)).toBe(true);
    expect(shows("province", 6)).toBe(true);
    expect(shows("country", 6)).toBe(false);
  });

  it("sets sea and lake names in spaced italic capitals", () => {
    const water = byId("water-name");
    expect(water.layout).toMatchObject({
      "text-font": ["Noto Sans Italic"],
      "text-letter-spacing": 0.3,
      "text-max-width": 6,
    });
    expect((water.layout?.["text-field"] as unknown[])[0]).toBe("upcase");
    expect(water.paint?.["text-opacity"]).toBe(regional.waterLabelOpacity);
  });

  it("puts a city dot beside each place name, the big dot for cities", () => {
    const place = byId("place");
    expect(place.layout).toMatchObject({
      "text-anchor": "left",
      "text-font": ["Noto Sans Bold"],
    });
    expect(place.layout?.["icon-image"]).toEqual([
      "match",
      ["get", "class"],
      "city",
      "coo:city-dot-major",
      "coo:city-dot",
    ]);
  });

  it("keeps a cream halo on every label that sits on the map", () => {
    for (const id of [
      "water-name",
      "street-name",
      "park-name",
      "place",
      "state",
    ]) {
      const width = byId(id).paint?.["text-halo-width"] as number;
      expect(width, id).toBeGreaterThanOrEqual(1.2);
      expect(width, id).toBeLessThanOrEqual(2);
    }
  });
});

describe("day style zooms and sparseness", () => {
  const MIN_ZOOMS: Record<string, number> = {
    urban: 9,
    "road-casing": 8,
    road: 8,
    "street-casing": 13,
    street: 13,
    building: 14,
    park: 12,
    "park-outline": 14,
    "woods-trees": 7,
    mountains: 7,
    "park-trees": 14,
    "city-park-trees": 16,
    "street-name": 15,
    "park-name": 15,
    shops: 15.5,
  };

  it("starts each detail layer at its zoom", () => {
    for (const [id, zoom] of Object.entries(MIN_ZOOMS)) {
      expect(byId(id).minzoom, id).toBe(zoom);
    }
    expect(byId("woods-trees").maxzoom).toBe(13);
    expect(byId("mountains").maxzoom).toBe(12);
  });

  it("draws only thin motorways below zoom 10.5", () => {
    for (const id of ["road", "road-casing"]) {
      const layer = byId(id);
      for (const zoom of [8, 9, 10, 10.5]) {
        for (const cls of ["trunk", "primary"]) {
          expect(
            evaluate(layer, "paint", "line-width", zoom, { class: cls }),
            `${id} ${cls} z${zoom}`,
          ).toBe(0);
        }
        const motorway = evaluate(layer, "paint", "line-width", zoom, {
          class: "motorway",
        }) as number;
        expect(motorway, `${id} motorway z${zoom}`).toBeGreaterThan(0);
        expect(motorway, `${id} motorway z${zoom}`).toBeLessThanOrEqual(3);
      }
      expect(
        evaluate(layer, "paint", "line-width", 11, { class: "primary" }),
      ).toBeGreaterThan(0);
    }
  });

  it("fades the wood and grass fill at regional zooms but not at zoom 6", () => {
    const green = byId("green");
    const at = (zoom: number) =>
      evaluate(green, "paint", "fill-opacity", zoom) as number;
    expect(at(6)).toBe(1);
    expect(at(7)).toBe(1);
    for (const zoom of [8, 9, 10, 11]) expect(at(zoom), `z${zoom}`).toBe(0.5);
    expect(at(13)).toBe(1);
  });

  it("keeps only each tile's top peak below zoom 10, spaced apart", () => {
    const peaks = featureFilter(
      byId("mountains").filter as FilterSpecification,
      "mountains.filter",
    );
    const shows = (rank: number, zoom: number, ele = 800) =>
      peaks.filter({ zoom }, {
        type: 1,
        properties: { class: "peak", rank, ele },
      } as never);
    expect(shows(1, 9)).toBe(true);
    expect(shows(2, 9)).toBe(false);
    expect(shows(2, 10)).toBe(true);
    expect(shows(3, 10)).toBe(false);
    expect(shows(1, 9, 499), "still 500 m or higher").toBe(false);
    expect(byId("mountains").layout).toMatchObject({
      "icon-allow-overlap": false,
      "icon-padding": 48,
    });
  });

  it("tints only park-like protected areas, and only from zoom 12", () => {
    const keeps = (id: string, cls: string) =>
      featureFilter(
        byId(id).filter as FilterSpecification,
        `${id}.filter`,
      ).filter({ zoom: 14 }, { type: 3, properties: { class: cls } } as never);
    for (const id of ["park", "park-trees"]) {
      for (const cls of ["national_park", "nature_reserve", "State Park"]) {
        expect(keeps(id, cls), `${id} ${cls}`).toBe(true);
      }
      for (const cls of [
        "protected_area",
        "National Public Lands",
        "forest_reserve",
        "State Game Land",
        "wildlife_refuge",
      ]) {
        expect(keeps(id, cls), `${id} ${cls}`).toBe(false);
      }
    }
  });

  it("thins place names by class and zoom", () => {
    const place = featureFilter(
      byId("place").filter as FilterSpecification,
      "place.filter",
    );
    const shows = (cls: string, zoom: number, rank = 5) =>
      place.filter({ zoom }, {
        type: 1,
        properties: { class: cls, rank },
      } as never);
    expect(shows("city", 4)).toBe(true);
    expect(shows("city", 6, 11), "z6 unchanged").toBe(true);
    expect(shows("town", 8)).toBe(false);
    expect(shows("town", 9)).toBe(true);
    for (const zoom of [8, 9, 10]) {
      expect(shows("city", zoom, 8), `big city z${zoom}`).toBe(true);
      expect(shows("city", zoom, 11), `small city z${zoom}`).toBe(false);
      expect(shows("town", zoom, 11), `small town z${zoom}`).toBe(false);
      expect(shows("village", zoom), `village z${zoom}`).toBe(false);
    }
    expect(shows("city", 11, 11)).toBe(true);
    expect(shows("town", 11, 11)).toBe(true);
    expect(shows("village", 11)).toBe(false);
    expect(shows("village", 12)).toBe(true);
    expect(shows("neighbourhood", 12)).toBe(false);
    expect(shows("neighbourhood", 13)).toBe(true);
    expect(shows("hamlet", 14)).toBe(false);
  });

  it("reads points of interest only for park names and generic shop pills", () => {
    const poi = layers.filter((l) => l["source-layer"] === "poi");
    expect(poi.map((l) => l.id).sort()).toEqual(["park-name", "shops"]);
    const shops = byId("shops");
    expect(fieldsIn(shops.layout)).not.toContain("name");
    expect(JSON.stringify(shops.layout)).not.toMatch(/"name/);
    expect(shops.layout?.["icon-image"]).toBe("coo:place-pill");
    expect(shops.layout?.["icon-text-fit"]).toBe("both");
    expect(matchedValues(shops.filter, "subclass").sort()).toEqual([
      "bakery",
      "books",
      "cafe",
      "deli",
      "ice_cream",
      "pet",
    ]);
    const word = (subclass: string) =>
      evaluate(shops, "layout", "text-field", 16, { subclass }).toString();
    expect(word("cafe")).toBe("COFFEE");
    expect(word("ice_cream")).toBe("ICE CREAM");
    for (const subclass of matchedValues(shops.filter, "subclass")) {
      expect(word(subclass), subclass).toMatch(/^[A-Z ]+$/);
    }
  });

  it("draws no transit, house numbers, airports or 3D", () => {
    const sourceLayers = layers.map((l) => l["source-layer"]);
    for (const banned of ["housenumber", "aerodrome_label", "aeroway"]) {
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

describe("day style decorations against the live tile samples", () => {
  type Sample = (typeof samples.samples)[number];
  const TYPES = { Point: 1, LineString: 2, Polygon: 3 } as const;

  const sample = (layer: string, place: string, zoom: number): Sample => {
    const found = samples.samples.find(
      (s) => s.layer === layer && s.place === place && s.zoom === zoom,
    );
    if (!found) throw new Error(`no ${layer} sample at ${place} z${zoom}`);
    return found;
  };

  /** The sampled features that a layer's filter keeps at a zoom. */
  const matches = (id: string, from: Sample, zoom = from.zoom) => {
    const { filter } = featureFilter(
      byId(id).filter as FilterSpecification,
      `${id}.filter`,
    );
    return (from.features as Record<string, unknown>[]).filter(
      ({ type, ...properties }) =>
        filter({ zoom }, {
          type: TYPES[type as keyof typeof TYPES],
          properties,
        } as never),
    );
  };

  it("puts pines on the Adirondack woods at zoom 9", () => {
    expect(
      matches("woods-trees", sample("woods-trees", "adirondacks", 9)),
    ).not.toHaveLength(0);
  });

  it("puts mountains on the Colorado peaks at zoom 9, never on saddles", () => {
    const found = matches("mountains", sample("mountains", "colorado", 9));
    expect(found).not.toHaveLength(0);
    expect(found.map((f) => f.class)).not.toContain("saddle");
    expect(found.map((f) => f.name)).toContain("Grays Peak");
  });

  it("puts no mountain on Manhattan's hills at zoom 11 or 12", () => {
    for (const zoom of [11, 12]) {
      const hills = sample("mountains", "new-york", zoom);
      expect(hills.features.length, `z${zoom} has peaks`).toBeGreaterThan(0);
      expect(matches("mountains", hills), `z${zoom}`).toEqual([]);
    }
  });

  it("puts squiggles on the sea off Cape Cod at zoom 6, not on rivers", () => {
    const sea = sample("water-waves", "cape-cod", 6);
    const found = matches("water-waves", sea);
    expect(found.map((f) => f.class)).toContain("ocean");
    expect(found.map((f) => f.class)).not.toContain("river");
  });

  it("gives New York the big city dot", () => {
    const places = sample("place", "new-york", 9);
    const newYork = matches("place", places).find((f) => f.name === "New York");
    expect(newYork, "New York passes the place filter").toBeDefined();
    const icon = evaluate(byId("place"), "layout", "icon-image", 9, newYork);
    expect(icon.toString()).toBe("coo:city-dot-major");
  });

  it("puts round trees on New York's city parks", () => {
    for (const zoom of [11, 12]) {
      const parks = matches(
        "city-park-trees",
        sample("woods-trees", "new-york", zoom),
        14,
      );
      expect(parks.length, `z${zoom}`).toBeGreaterThan(0);
      for (const p of parks) expect(p.subclass).toBe("park");
    }
  });

  // tile-samples.json has no poi samples and no zoom 14 tiles yet, so shop
  // pills and street-zoom parks cannot be checked against live tiles here.
  it.todo("puts shop pills on Williamsburg's cafes at zoom 14");
});

describe("day style at the representative QA views", () => {
  const FEATURE_COLOURS: Record<string, unknown[]> = {
    parks: [regional.park, regional.woods, street.park, street.parkLine],
    "major-roads": [regional.road, regional.roadCasing],
    water: [regional.water, regional.waterLine, regional.river],
  };

  it("covers parks, major roads and water at every place", () => {
    for (const feature of Object.keys(FEATURE_COLOURS)) {
      const places = qa.views
        .filter((v) => v.feature === feature)
        .map((v) => v.place);
      expect(new Set(places), feature).toEqual(
        new Set(PLACES.map((p) => p.id)),
      );
    }
  });

  it.each(qa.views)(
    "draws $feature at $place z$zoom in the map colours",
    ({ feature, place, zoom, layers: ids }) => {
      expect(PLACES.map((p) => p.id)).toContain(place);
      expect(ZOOMS).toContain(zoom);
      const allowed = FEATURE_COLOURS[feature].map((c) =>
        (c as string).toUpperCase(),
      );
      for (const id of ids) {
        const layer = byId(id);
        expect(layer.minzoom ?? 0, id).toBeLessThanOrEqual(zoom);
        expect(layer.maxzoom ?? 24, id).toBeGreaterThan(zoom);
        const props = Object.keys(layer.paint ?? {}).filter((p) =>
          p.endsWith("-color"),
        );
        expect(props.length, id).toBeGreaterThan(0);
        for (const prop of props) {
          const value = layer.paint?.[prop];
          // A colour that blends between 12 and 14 is read at the view's zoom.
          const hex = Array.isArray(value)
            ? (value as unknown[])[zoom <= 12 ? 4 : 6]
            : value;
          expect(allowed, `${id} ${prop}`).toContain(
            (hex as string).toUpperCase(),
          );
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
