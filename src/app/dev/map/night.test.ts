import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import colours from "../../../../assets/map/map-colours.json";
import overrides from "../../../../assets/map/coo-night.overrides.json";
import day from "../../../../public/map/coo-day.style.json";
import night from "../../../../public/map/coo-night.style.json";
import sprite from "../../../../public/map/sprite/coo.json";
import {
  DAY_ONLY,
  LABELS,
  ROLES,
  deriveNight,
  type Section,
  type Style,
} from "./night";
import qa from "./qa-views.json";

type Layer = Style["layers"][number];
type Role = keyof typeof ROLES;

const dayLayers = day.layers as Layer[];
const nightLayers = night.layers as Layer[];
const nightById = (id: string) => nightLayers.find((l) => l.id === id)!;
const target = (id: string, section: Section, prop: string) =>
  `${id} ${section}.${prop}`;

/** Every day property that night must either repaint or keep on purpose. */
const themed = (layer: Layer) => [
  ...Object.keys(layer.paint ?? {})
    .filter((p) => p.endsWith("-color") || p === "fill-pattern")
    .map((p) => target(layer.id, "paint", p)),
  ...Object.keys(layer.layout ?? {})
    .filter((p) => p === "icon-image")
    .map((p) => target(layer.id, "layout", p)),
];

/** Sprite names an icon value can resolve to, from a string or a match. */
const icons = (value: unknown): string[] =>
  [value]
    .flat()
    .filter((v): v is string => typeof v === "string" && v.startsWith("coo:"));

describe("night style", () => {
  it("is the committed output of deriveNight over the packet overrides", () => {
    expect(night).toEqual(deriveNight(day as Style, overrides));
  });

  it("has a role for every override and no role without one", () => {
    const keys = Object.keys(overrides).filter((k) => k !== "note");
    expect(Object.keys(ROLES).sort()).toEqual(keys.sort());
    for (const [role, targets] of Object.entries(ROLES)) {
      expect(targets.length, role).toBeGreaterThan(0);
    }
  });

  it("repaints or keeps every day colour, pattern and icon exactly once", () => {
    const covered = [
      ...Object.values(ROLES).flatMap((ts) =>
        ts.map(([id, section, prop]) => target(id, section, prop)),
      ),
      ...DAY_ONLY.map(([id, section, prop]) => target(id, section, prop)),
    ];
    expect(new Set(covered).size, "no target twice").toBe(covered.length);
    const themedTargets = covered.filter((t) =>
      /(-color|\.fill-pattern|\.icon-image)$/.test(t),
    );
    expect(themedTargets.sort()).toEqual(dayLayers.flatMap(themed).sort());
  });

  it("uses the night palette of assets/map/map-colours.json", () => {
    const palette: Record<string, unknown> = colours.night;
    const shared = Object.keys(overrides).filter(
      (k) =>
        k in palette &&
        k !== "urban" &&
        icons(overrides[k as Role]).length === 0,
    );
    expect(shared.length).toBeGreaterThan(10);
    for (const key of shared) {
      expect(overrides[key as Role], key).toEqual(palette[key]);
    }
    expect(overrides.urban, "urban to block between z12 and z14").toEqual([
      "interpolate",
      ["linear"],
      ["zoom"],
      12,
      colours.night.urban,
      14,
      colours.night.block,
    ]);
  });

  it("swaps every decoration for its -night sprite icon", () => {
    const names = Object.keys(sprite);
    const nightIcons = [
      overrides.wavePattern,
      overrides.treePine,
      overrides.treeRound,
      overrides.mountain,
      overrides.cityDot,
    ].flatMap(icons);
    expect(nightIcons.length).toBe(6);
    for (const icon of nightIcons) {
      expect(icon, icon).toMatch(/^coo:.+-night$/);
      expect(names, icon).toContain(icon.slice("coo:".length));
    }
    for (const layer of nightLayers) {
      const used = [
        ...icons(layer.layout?.["icon-image"]),
        ...icons(layer.paint?.["fill-pattern"]),
      ];
      for (const icon of used) {
        if (layer.id === "shops") expect(icon).toBe("coo:place-pill");
        else expect(icon, layer.id).toMatch(/-night$/);
      }
    }
  });

  it("keeps the day layers, sources, filters and layout", () => {
    expect(night.sources).toEqual(day.sources);
    expect(night.sources.openmaptiles.maxzoom, "overzooms past z14").toBe(14);
    expect(night.glyphs).toBe(day.glyphs);
    expect(night.sprite).toEqual(day.sprite);
    const shape = (layers: Layer[]) =>
      layers.map(({ paint, layout, ...rest }) => ({
        ...rest,
        paint: Object.keys(paint ?? {}),
        layout: Object.keys(layout ?? {}),
      }));
    expect(shape(nightLayers)).toEqual(shape(dayLayers));
  });

  it("sets each role's targets to its night value", () => {
    for (const [role, targets] of Object.entries(ROLES)) {
      const value = overrides[role as Role];
      for (const [id, section, prop] of targets) {
        expect(
          nightById(id)[section]?.[prop],
          target(id, section, prop),
        ).toEqual(value);
      }
    }
  });

  it("keeps the shop pill a cream pill with ink words", () => {
    const day = dayLayers.find((l) => l.id === "shops")!;
    expect(nightById("shops").paint).toEqual(day.paint);
    expect(nightById("shops").layout).toEqual(day.layout);
  });

  it("names the night style after the day style it came from", () => {
    const renamed = { ...(day as Style), name: "Any day" };
    expect(deriveNight(renamed, overrides).name).toBe("Any night");
  });

  it("refuses an override file that is missing a role", () => {
    const short: Partial<typeof overrides> = { ...overrides };
    delete short.land;
    expect(() =>
      deriveNight(day as Style, short as unknown as typeof overrides),
    ).toThrow("night role land has no value");
  });

  it("drops the stray public copy of the overrides", () => {
    expect(existsSync("public/map/coo-night.overrides.json")).toBe(false);
  });
});

describe("night style at the representative QA views", () => {
  const FEATURE_ROLES: Record<string, Role[]> = {
    parks: ["park", "woods", "parkLine"],
    "major-roads": ["road", "roadCasing"],
    water: ["water", "waterLine", "river"],
  };

  it.each(qa.views)(
    "draws $feature at $place z$zoom in the night colours",
    ({ feature, zoom, layers: ids }) => {
      const allowed = FEATURE_ROLES[feature].map((r) => overrides[r]);
      for (const id of ids) {
        const layer = nightById(id);
        expect(layer.minzoom ?? 0, id).toBeLessThanOrEqual(zoom);
        expect(layer.maxzoom ?? 24, id).toBeGreaterThan(zoom);
        for (const prop of Object.keys(layer.paint ?? {})) {
          if (!prop.endsWith("-color")) continue;
          expect(allowed, target(id, "paint", prop)).toContainEqual(
            layer.paint?.[prop],
          );
        }
      }
    },
  );

  it("paints land and every label in the night colours", () => {
    expect(nightById("land").paint?.["background-color"]).toBe(overrides.land);
    const labels = nightLayers.filter(
      (l) => l.type === "symbol" && l.layout?.["text-field"],
    );
    expect(labels.map((l) => l.id).sort()).toEqual([...LABELS, "shops"].sort());
    for (const id of LABELS) {
      expect(nightById(id).paint?.["text-color"], id).toBe(overrides.label);
      expect(nightById(id).paint?.["text-halo-color"], id).toBe(overrides.halo);
    }
  });
});
