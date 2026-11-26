import { readFileSync, writeFileSync } from "node:fs";

type Layer = {
  id: string;
  type: string;
  paint?: Record<string, unknown>;
  layout?: Record<string, unknown>;
  [key: string]: unknown;
};

export type Style = {
  name: string;
  metadata: Record<string, string>;
  layers: Layer[];
  [key: string]: unknown;
};

export type Section = "paint" | "layout";
export type Target = readonly [layer: string, section: Section, prop: string];

const paint = (ids: readonly string[], prop: string): Target[] =>
  ids.map((id) => [id, "paint", prop] as const);
const layout = (ids: readonly string[], prop: string): Target[] =>
  ids.map((id) => [id, "layout", prop] as const);

export const LABELS = [
  "water-name",
  "street-name",
  "park-name",
  "place",
  "state",
] as const;

/**
 * Each night role names the day properties it repaints. The value for each
 * role is in assets/map/coo-night.overrides.json, so the night style is always
 * the day style with those values swapped in.
 */
export const ROLES = {
  land: paint(["land"], "background-color"),
  urban: paint(["urban"], "fill-color"),
  woods: paint(["green"], "fill-color"),
  park: paint(["city-park", "park"], "fill-color"),
  water: paint(["water"], "fill-color"),
  river: paint(["river"], "line-color"),
  waterLine: paint(["shoreline", "river-casing"], "line-color"),
  // The water's own edge: waterLine at lineOpacity, so it matches the shore.
  waterEdge: paint(["water"], "fill-outline-color"),
  parkLine: paint(["park-outline"], "line-color"),
  lineOpacity: paint(
    ["shoreline", "river-casing", "park-outline"],
    "line-opacity",
  ),
  block: paint(["building"], "fill-color"),
  lotLine: paint(["building"], "fill-outline-color"),
  road: paint(["road", "street"], "line-color"),
  roadCasing: paint(["road-casing", "street-casing"], "line-color"),
  border: paint(["border", "state-border"], "line-color"),
  borderOpacity: paint(["border", "state-border"], "line-opacity"),
  label: paint(LABELS, "text-color"),
  halo: paint(LABELS, "text-halo-color"),
  stateLabelOpacity: paint(["state"], "text-opacity"),
  waterLabelOpacity: paint(["water-name"], "text-opacity"),
  wavePattern: paint(["water-waves"], "fill-pattern"),
  treePine: layout(["woods-trees"], "icon-image"),
  treeRound: layout(["park-trees", "city-park-trees"], "icon-image"),
  mountain: layout(["mountains"], "icon-image"),
  cityDot: layout(["place"], "icon-image"),
} satisfies Record<string, readonly Target[]>;

/** Day colours and icons that stay the same at night. */
export const DAY_ONLY: readonly Target[] = [
  // The shop pill stays a cream pill with ink words at night.
  ["shops", "paint", "text-color"],
  ["shops", "layout", "icon-image"],
];

export type NightOverrides = Record<keyof typeof ROLES, unknown>;

export function deriveNight(day: Style, overrides: NightOverrides): Style {
  const night: Style = structuredClone(day);
  night.name = day.name.replace(/day$/, "night");
  night.metadata = {
    ...day.metadata,
    "coo:night":
      "Generated from coo-day.style.json and assets/map/coo-night.overrides.json by src/app/dev/map/night.ts",
  };
  for (const [role, targets] of Object.entries(ROLES)) {
    if (!(role in overrides))
      throw new Error(`night role ${role} has no value`);
    for (const [id, section, prop] of targets) {
      const props = night.layers.find((l) => l.id === id)?.[section];
      if (!props || !(prop in props)) {
        throw new Error(
          `night role ${role} has no ${section} ${prop} on ${id}`,
        );
      }
      props[prop] = structuredClone(overrides[role as keyof typeof ROLES]);
    }
  }
  return night;
}

if (import.meta.main) {
  const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
  const night = deriveNight(
    read("public/map/coo-day.style.json"),
    read("assets/map/coo-night.overrides.json"),
  );
  writeFileSync(
    "public/map/coo-night.style.json",
    `${JSON.stringify(night, null, 2)}\n`,
  );
}
