import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import overrides from "../../../../assets/map/coo-night.overrides.json";
import day from "../../../../public/map/coo-day.style.json";
import night from "../../../../public/map/coo-night.style.json";
import { DAY_ONLY, ROLES, deriveNight, type Style } from "./night";
import qa from "./qa-views.json";

type Layer = Style["layers"][number];

const nightLayers = night.layers as Layer[];
const colourProps = (layer: Layer) =>
  Object.keys(layer.paint ?? {}).filter((p) => p.endsWith("-color"));
const nightById = (id: string) => nightLayers.find((l) => l.id === id)!;
const target = (id: string, prop: string) => `${id} ${prop}`;

describe("night style", () => {
  it("is the committed output of deriveNight over the packet overrides", () => {
    expect(night).toEqual(deriveNight(day as Style, overrides));
  });

  it("has a role for every override colour and no role without one", () => {
    const keys = Object.keys(overrides).filter((k) => k !== "note");
    expect(Object.keys(ROLES).sort()).toEqual(keys.sort());
    for (const [role, targets] of Object.entries(ROLES)) {
      expect(targets.length, role).toBeGreaterThan(0);
    }
  });

  it("recolours or keeps every day colour exactly once", () => {
    const covered = [
      ...Object.values(ROLES).flatMap((ts) =>
        ts.map(([id, prop]) => target(id, prop)),
      ),
      ...DAY_ONLY.map(([id, prop]) => target(id, prop)),
    ];
    const dayColours = (day.layers as Layer[]).flatMap((l) =>
      colourProps(l).map((p) => target(l.id, p)),
    );
    expect(covered.sort()).toEqual(dayColours.sort());
  });

  it("keeps the day layers, sources, filters and layout", () => {
    expect(night.sources).toEqual(day.sources);
    expect(night.glyphs).toBe(day.glyphs);
    expect(night.sprite).toBe(day.sprite);
    const shape = (layers: Layer[]) =>
      layers.map(({ paint, ...rest }) => ({
        ...rest,
        paint: Object.keys(paint ?? {}),
      }));
    expect(shape(nightLayers)).toEqual(shape(day.layers as Layer[]));
  });

  it("paints each role's layers in its night override colour", () => {
    for (const [role, targets] of Object.entries(ROLES)) {
      const hex = overrides[role as keyof typeof ROLES];
      for (const [id, prop] of targets) {
        expect(nightById(id).paint?.[prop], target(id, prop)).toBe(hex);
      }
    }
  });

  it("drops the stray public copy of the overrides", () => {
    expect(existsSync("public/map/coo-night.overrides.json")).toBe(false);
  });
});

describe("night style at the representative QA views", () => {
  const FEATURE_ROLES: Record<string, (keyof typeof ROLES)[]> = {
    parks: ["park", "green"],
    "major-roads": ["road", "road-casing"],
    water: ["water", "shoreline", "river", "river-casing"],
  };

  it.each(qa.views)(
    "draws $feature at $place z$zoom in the night override colours",
    ({ feature, zoom, layers: ids }) => {
      const allowed = FEATURE_ROLES[feature].map((r) => overrides[r]);
      for (const id of ids) {
        const layer = nightById(id);
        expect(layer.minzoom ?? 0, id).toBeLessThanOrEqual(zoom);
        expect(layer.maxzoom ?? 24, id).toBeGreaterThan(zoom);
        for (const prop of colourProps(layer)) {
          expect(allowed, target(id, prop)).toContain(layer.paint?.[prop]);
        }
      }
    },
  );

  it("paints land and every label in the night colours", () => {
    expect(nightById("land").paint?.["background-color"]).toBe(overrides.land);
    const labels = nightLayers.filter((l) => l.type === "symbol");
    expect(labels.length).toBeGreaterThan(0);
    for (const label of labels) {
      expect(label.paint?.["text-color"], label.id).toBe(overrides.text);
      expect(label.paint?.["text-halo-color"], label.id).toBe(overrides.halo);
    }
  });
});
