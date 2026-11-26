import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { config, manifestNames } from "@/lib/config";

const root = fileURLToPath(new URL("../..", import.meta.url));
const configDir = join(root, "config");
const srcDir = join(root, "src");
const configModule = join(srcDir, "lib", "config.ts");
const flightEngine = join(srcDir, "lib", "flight", "engine.ts");
const productNameExempt = new Set([configModule, flightEngine]);
const wordsContainingProductName = /Cookie|Coordinate/g;

function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .map((entry) => join(dir, entry))
    .filter((path) => statSync(path).isFile());
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

function configKeyPath(file: string): string[] {
  return relative(configDir, file)
    .replace(/\.json$/, "")
    .split(sep)
    .map((segment) =>
      segment.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase()),
    );
}

function valueAt(source: unknown, keys: string[]): unknown {
  return keys.reduce<unknown>(
    (node, key) =>
      node !== null && typeof node === "object"
        ? (node as Record<string, unknown>)[key]
        : undefined,
    source,
  );
}

function productNameOffenders(files: Record<string, string>): string[] {
  return Object.keys(files).filter(
    (file) =>
      !productNameExempt.has(file) &&
      files[file].replace(wordsContainingProductName, "").includes(app.name),
  );
}

const app = readJson(join(configDir, "app.json")) as {
  name: string;
  shortName: string;
};

describe("config", () => {
  it("takes the app name from config/app.json", () => {
    expect(config.app.name).toBe(app.name);
    expect(manifestNames).toEqual({
      name: app.name,
      short_name: app.shortName,
    });
  });

  it("loads every JSON file in config/", () => {
    const files = listFiles(configDir).filter((file) => file.endsWith(".json"));
    expect(files.length).toBeGreaterThanOrEqual(11);
    for (const file of files) {
      const keys = configKeyPath(file);
      expect(valueAt(config, keys), `config.${keys.join(".")}`).toEqual(
        readJson(file),
      );
    }
  });

  it("keeps the product name out of src/ except the config module and the flight engine", () => {
    const files = Object.fromEntries(
      listFiles(srcDir).map((file) => [file, readFileSync(file, "utf8")]),
    );
    expect(
      productNameOffenders(files).map((file) =>
        relative(root, file).split(sep).join("/"),
      ),
    ).toEqual([]);
  });

  it("flags the product name even with a letter right next to it", () => {
    const label = join(srcDir, "review-product-label.ts");
    const flightNeighbour = join(srcDir, "lib", "flight", "route.ts");
    const cookieJar = join(srcDir, "server", "supabase", "cookies.ts");
    const cookieJarWithName = join(srcDir, "server", "jar.ts");
    const geolocation = join(srcDir, "lib", "position.ts");
    expect(
      productNameOffenders({
        [label]: `export const productLabel = "${app.name}Mail";`,
        [configModule]: `export const name = "${app.name}";`,
        [flightEngine]: ` * ${app.name} flight engine: reference implementation.`,
        [flightNeighbour]: `// ${app.name} route`,
        [cookieJar]: `import type { CookieOptions } from "@supabase/ssr";\nconst [setCookie] = res.headers.getSetCookie();`,
        [cookieJarWithName]: `// Cookies for ${app.name}`,
        [geolocation]: `type Fix = Pick<GeolocationCoordinates, "latitude">;`,
      }),
    ).toEqual([label, flightNeighbour, cookieJarWithName]);
  });
});

describe("gear prices", () => {
  const items = config.gear.items;
  const byId = new Map(items.map((item) => [item.id, item]));

  it("pins every gear price to the flock-wide unlock table", () => {
    expect(
      Object.fromEntries(items.map((item) => [item.id, item.price])),
    ).toEqual({
      booties: 60,
      bell: 70,
      bow: 90,
      party: 120,
      band: 140,
      beanie: 170,
      goggles: 180,
      rainhat: 180,
      bandana: 200,
      earmuffs: 210,
      scarf: 230,
      cap: 240,
      nightgoggles: 300,
      tube: 300,
      backpack: 450,
    });
  });

  it("keeps the backpack off sale and the bell and bow as starters", () => {
    expect(byId.get("backpack")?.available).toBe(false);
    expect(byId.get("bell")).toMatchObject({ starter: true, price: 70 });
    expect(byId.get("bow")).toMatchObject({ starter: true, price: 90 });
  });

  it("totals 2330 seeds across the twelve purchasable items", () => {
    const purchasable = items.filter((item) => item.available && !item.starter);
    expect(purchasable).toHaveLength(12);
    expect(purchasable.reduce((sum, item) => sum + item.price, 0)).toBe(2330);
  });
});

describe("loft add-ons", () => {
  it("lists the birdbath then the three new add-ons with their prices", () => {
    expect(config.game.loftItems.map(({ id, price }) => [id, price])).toEqual([
      ["birdbath", 220],
      ["flower-boxes", 90],
      ["weathervane", 140],
      ["espresso-cart", 260],
    ]);
  });

  it("keeps the espresso shot as its own consumable beside the espresso cart", () => {
    expect(
      config.game.consumables.find((item) => item.id === "espresso"),
    ).toMatchObject({ name: "Espresso shot", price: 25 });
  });
});
