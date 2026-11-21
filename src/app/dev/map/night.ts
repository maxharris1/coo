import { readFileSync, writeFileSync } from "node:fs";

type Layer = {
  id: string;
  type: string;
  paint?: Record<string, unknown>;
  [key: string]: unknown;
};

export type Style = {
  name: string;
  metadata: Record<string, string>;
  layers: Layer[];
  [key: string]: unknown;
};

type Target = readonly [layer: string, paintProp: string];

const LABELS = ["water-name", "street-name", "place", "state"];

export const ROLES = {
  land: [["land", "background-color"]],
  urban: [["urban", "fill-color"]],
  green: [["green", "fill-color"]],
  park: [["park", "fill-color"]],
  water: [["water", "fill-color"]],
  shoreline: [
    ["shoreline", "line-color"],
    ["water", "fill-outline-color"],
  ],
  river: [["river", "line-color"]],
  "river-casing": [["river-casing", "line-color"]],
  building: [["building", "fill-color"]],
  road: [
    ["road", "line-color"],
    ["street", "line-color"],
  ],
  "road-casing": [
    ["road-casing", "line-color"],
    ["street-casing", "line-color"],
  ],
  text: LABELS.map((id) => [id, "text-color"] as const),
  halo: LABELS.map((id) => [id, "text-halo-color"] as const),
} satisfies Record<string, readonly Target[]>;

export const DAY_ONLY: readonly Target[] = [
  ["building", "fill-outline-color"],
  ["border", "line-color"],
];

export type NightOverrides = Record<keyof typeof ROLES, string>;

export function deriveNight(day: Style, overrides: NightOverrides): Style {
  const night: Style = structuredClone(day);
  night.name = day.name.replace(/day$/, "night");
  night.metadata = {
    ...day.metadata,
    "coo:night":
      "Generated from coo-day.style.json and assets/map/coo-night.overrides.json by src/app/dev/map/night.ts",
  };
  for (const [role, targets] of Object.entries(ROLES)) {
    for (const [id, prop] of targets) {
      const layer = night.layers.find((l) => l.id === id);
      if (!layer?.paint || !(prop in layer.paint)) {
        throw new Error(`night role ${role} has no ${prop} on layer ${id}`);
      }
      layer.paint[prop] = overrides[role as keyof typeof ROLES];
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
