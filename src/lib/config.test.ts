import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { config, manifestNames } from "@/lib/config";

const root = fileURLToPath(new URL("../..", import.meta.url));
const configDir = join(root, "config");
const srcDir = join(root, "src");
const configModule = join(srcDir, "lib", "config.ts");

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
    (file) => file !== configModule && files[file].includes(app.name),
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

  it("keeps the product name out of src/ except the config module", () => {
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
    expect(
      productNameOffenders({
        [label]: `export const productLabel = "${app.name}Mail";`,
        [configModule]: `export const name = "${app.name}";`,
      }),
    ).toEqual([label]);
  });
});
