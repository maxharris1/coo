import { readFileSync } from "node:fs";
import { PbfWriter } from "pbf";
import { describe, expect, it } from "vitest";
import {
  DECORATIONS,
  FACT_ZOOMS,
  MAX_FEATURES,
  decodeTile,
  factTiles,
  pick,
  sampleTiles,
  samples,
  sourceLayerFacts,
  tileAt,
  type Feature,
  type TileJSON,
} from "./sample-tiles";

type FixtureLayer = {
  name: string;
  type: 1 | 2 | 3;
  features: Record<string, string>[];
};

const GEOMETRY = {
  1: [9, 2, 2],
  2: [9, 2, 2, 10, 2, 2],
  3: [9, 0, 0, 18, 4, 0, 0, 4, 15],
};

function encodeTile(layers: FixtureLayer[]): Uint8Array {
  const pbf = new PbfWriter();
  for (const layer of layers) {
    pbf.writeMessage(
      3,
      (l: FixtureLayer, w) => {
        const keys = [...new Set(l.features.flatMap(Object.keys))];
        const values = [...new Set(l.features.flatMap(Object.values))];
        w.writeVarintField(15, 2);
        w.writeStringField(1, l.name);
        for (const props of l.features) {
          w.writeMessage(
            2,
            (p: Record<string, string>, fw) => {
              fw.writePackedVarint(
                2,
                Object.entries(p).flatMap(([k, v]) => [
                  keys.indexOf(k),
                  values.indexOf(v),
                ]),
              );
              fw.writeVarintField(3, l.type);
              fw.writePackedVarint(4, GEOMETRY[l.type]);
            },
            props,
          );
        }
        for (const k of keys) w.writeStringField(3, k);
        for (const v of values) {
          w.writeMessage(4, (s: string, vw) => vw.writeStringField(1, s), v);
        }
        w.writeVarintField(5, 4096);
      },
      layer,
    );
  }
  return pbf.finish();
}

describe("tileAt", () => {
  it("finds the z12 tile over Times Square", () => {
    expect(tileAt([-73.9855, 40.758], 12)).toEqual({ z: 12, x: 1206, y: 1539 });
  });

  it("covers the views places and mountain country at every fact zoom", () => {
    const tiles = factTiles();
    const places = new Set(tiles.map((t) => t.place));
    expect(places).toEqual(
      new Set(["new-york", "rural-pa", "cape-cod", "adirondacks", "colorado"]),
    );
    expect(tiles).toHaveLength(places.size * FACT_ZOOMS.length);
    expect(FACT_ZOOMS).toContain(14);
  });
});

describe("sampleTiles", () => {
  it("covers every fact place at each sample zoom plus New York at z11", () => {
    const tiles = sampleTiles();
    expect(tiles).toHaveLength(21);
    expect(tiles).toContainEqual({
      place: "new-york",
      ...tileAt([-73.9855, 40.758], 11),
    });
    for (const [place, center] of [
      ["adirondacks", [-73.92, 44.11]],
      ["colorado", [-106, 39.5]],
    ] as const) {
      for (const z of [3, 6, 9, 12]) {
        expect(tiles).toContainEqual({ place, ...tileAt(center, z) });
      }
    }
  });
});

describe("decodeTile", () => {
  it("keeps each feature's properties and geometry type per source layer", () => {
    const buf = encodeTile([
      {
        name: "mountain_peak",
        type: 1,
        features: [{ class: "peak", name: "Marcy", "name:fr": "Marcy" }],
      },
      {
        name: "water",
        type: 3,
        features: [{ class: "lake" }, { class: "river" }],
      },
      { name: "transportation", type: 2, features: [{ class: "path" }] },
    ]);
    expect(decodeTile(buf)).toEqual({
      mountain_peak: [{ type: "Point", class: "peak", name: "Marcy" }],
      water: [
        { type: "Polygon", class: "lake" },
        { type: "Polygon", class: "river" },
      ],
      transportation: [{ type: "LineString", class: "path" }],
    });
  });
});

describe("pick", () => {
  const feature = (cls: string, rank?: number): Feature =>
    rank === undefined
      ? { type: "Point", class: cls }
      : { type: "Point", class: cls, rank };

  it("keeps every feature in tile order when there are at most 20", () => {
    const features = Array.from({ length: 20 }, (_, i) =>
      feature("peak", 20 - i),
    );
    expect(pick(features)).toEqual(features);
  });

  it("keeps one of each class and fills the rest with the lowest ranks", () => {
    const peaks = Array.from({ length: 27 }, (_, i) => feature("peak", i + 1));
    const saddle = feature("saddle", 99);
    const volcano = feature("volcano");
    const unranked = feature("peak");
    const features = [unranked, ...peaks.toReversed(), volcano, saddle];

    const picked = pick(features);

    expect(features).toHaveLength(30);
    expect(picked).toEqual([...peaks.slice(0, 18), saddle, volcano]);
  });

  it("keeps tile order among equal ranks", () => {
    const features = Array.from({ length: 4 }, (_, i) =>
      feature(`c${i % 2}`, 1),
    );
    expect(pick(features, 3)).toEqual(features.slice(0, 3));
  });
});

describe("samples", () => {
  it("samples each decoration from its source layer for every tile", () => {
    const layers = {
      water: [feature("lake")],
      landcover: [feature("wood")],
      mountain_peak: [feature("peak")],
      place: [feature("city")],
      poi: [feature("cafe")],
    };
    const result = samples([
      { place: "colorado", zoom: 9, layers },
      { place: "cape-cod", zoom: 3, layers: {} },
    ]);

    expect(result).toHaveLength(8);
    expect(result).toContainEqual({
      layer: "water-waves",
      place: "colorado",
      zoom: 9,
      features: layers.water,
    });
    expect(result).toContainEqual({
      layer: "woods-trees",
      place: "colorado",
      zoom: 9,
      features: layers.landcover,
    });
    expect(result).toContainEqual({
      layer: "mountains",
      place: "colorado",
      zoom: 9,
      features: layers.mountain_peak,
    });
    expect(result).toContainEqual({
      layer: "place",
      place: "colorado",
      zoom: 9,
      features: layers.place,
    });
    expect(result).toContainEqual({
      layer: "mountains",
      place: "cape-cod",
      zoom: 3,
      features: [],
    });
  });

  function feature(cls: string): Feature {
    return { type: "Polygon", class: cls };
  }
});

describe("tile-samples.json", () => {
  type Sample = {
    layer: string;
    place: string;
    zoom: number;
    features: Feature[];
  };
  const committed = (): Sample[] =>
    JSON.parse(readFileSync("src/app/dev/map/tile-samples.json", "utf8"))
      .samples;

  it("has one sample per decoration layer for every sampled tile", () => {
    const key = (layer: string, place: string, zoom: number) =>
      `${layer} ${place} z${zoom}`;
    const expected = Object.keys(DECORATIONS).flatMap((layer) =>
      sampleTiles().map((t) => key(layer, t.place, t.z)),
    );
    expect(expected).toHaveLength(84);
    expect(
      committed()
        .map((s) => key(s.layer, s.place, s.zoom))
        .sort(),
    ).toEqual(expected.sort());
  });

  it("keeps at most 20 typed features per sample", () => {
    for (const { features } of committed()) {
      expect(features.length).toBeLessThanOrEqual(MAX_FEATURES);
      for (const f of features) {
        expect(["Point", "LineString", "Polygon"]).toContain(f.type);
      }
    }
  });
});

describe("sourceLayerFacts", () => {
  const tilejson: TileJSON = {
    vector_layers: [
      {
        id: "water",
        fields: { class: "String", brunnel: "String", intermittent: "Number" },
      },
      {
        id: "place",
        fields: { class: "String", name: "String", "name:de": "String" },
      },
      { id: "building", fields: { render_height: "Number", colour: "String" } },
    ],
  };

  it("lists every TileJSON layer's sorted fields and the classes seen in tiles", () => {
    const facts = sourceLayerFacts(tilejson, [
      { water: [{ class: "river" }, { class: "lake" }], place: [] },
      { water: [{ class: "ocean" }, { class: "lake" }], building: [{}] },
    ]);
    expect(facts).toEqual({
      water: {
        fields: ["brunnel", "class", "intermittent"],
        classes: ["lake", "ocean", "river"],
      },
      place: { fields: ["class", "name", "name:*"], classes: [] },
      building: { fields: ["colour", "render_height"], classes: [] },
    });
  });

  it("ignores tile layers the TileJSON does not list", () => {
    const facts = sourceLayerFacts(tilejson, [{ poi: [{ class: "cafe" }] }]);
    expect(Object.keys(facts)).toEqual(["water", "place", "building"]);
  });
});
