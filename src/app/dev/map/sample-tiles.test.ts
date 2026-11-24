import { PbfWriter } from "pbf";
import { describe, expect, it } from "vitest";
import {
  FACT_ZOOMS,
  decodeTile,
  factTiles,
  sourceLayerFacts,
  tileAt,
  type TileJSON,
} from "./sample-tiles";

type FixtureLayer = { name: string; features: Record<string, string>[] };

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
              fw.writeVarintField(3, 1);
              fw.writePackedVarint(4, [9, 2, 2]);
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

describe("decodeTile", () => {
  it("keeps each feature's properties per source layer", () => {
    const buf = encodeTile([
      {
        name: "mountain_peak",
        features: [{ class: "peak", name: "Marcy", "name:fr": "Marcy" }],
      },
      { name: "water", features: [{ class: "lake" }, { class: "river" }] },
    ]);
    expect(decodeTile(buf)).toEqual({
      mountain_peak: [{ class: "peak", name: "Marcy" }],
      water: [{ class: "lake" }, { class: "river" }],
    });
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
