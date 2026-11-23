import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { metadata, viewport } from "./layout";
import manifest from "./manifest";

const publicDir = new URL("../../public/", import.meta.url);

function pngSize(src: string) {
  const bytes = readFileSync(new URL(`.${src}`, publicDir));
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  expect(bytes.subarray(12, 16).toString("ascii")).toBe("IHDR");
  return `${bytes.readUInt32BE(16)}x${bytes.readUInt32BE(20)}`;
}

describe("web app manifest", () => {
  const m = manifest();

  it("takes its name, short name and colours from config/app.json", () => {
    expect(m.name).toBe(config.app.name);
    expect(m.short_name).toBe(config.app.shortName);
    expect(m.theme_color).toBe(config.app.themeColor);
    expect(m.background_color).toBe(config.app.backgroundColor);
  });

  it("opens standalone and portrait, starting inside its scope", () => {
    expect(m.display).toBe("standalone");
    expect(m.orientation).toBe("portrait");
    expect(m.scope).toBe("/");
    expect(m.start_url?.startsWith(m.scope ?? "")).toBe(true);
    expect(m.prefer_related_applications).not.toBe(true);
  });

  it("lists 192 and 512 PNG icons and a maskable 512 whose real sizes match", () => {
    const icons = m.icons ?? [];
    for (const icon of icons) {
      expect(icon.type).toBe("image/png");
      expect(pngSize(icon.src)).toBe(icon.sizes);
    }
    const any = icons.filter((i) => (i.purpose ?? "any") === "any");
    expect(any.map((i) => i.sizes).sort()).toEqual(["192x192", "512x512"]);
    expect(
      icons.filter((i) => i.purpose === "maskable").map((i) => i.sizes),
    ).toEqual(["512x512"]);
  });
});

describe("root layout", () => {
  it("marks the app as an Apple web app whose status bar lets content draw underneath", () => {
    expect(metadata.appleWebApp).toEqual({
      capable: true,
      title: config.app.shortName,
      statusBarStyle: "black-translucent",
    });
    expect(metadata.other?.["apple-mobile-web-app-capable"]).toBe("yes");
  });

  it("links the 180 px apple touch icon", () => {
    const apple = (metadata.icons as { apple: string }).apple;
    expect(pngSize(apple)).toBe("180x180");
  });

  it("covers the screen edge to edge in the config theme colour", () => {
    expect(viewport.viewportFit).toBe("cover");
    expect(viewport.themeColor).toEqual([
      expect.objectContaining({ color: config.app.themeColor }),
      expect.objectContaining({ color: config.app.themeColor }),
    ]);
  });
});

describe("safe areas", () => {
  const css = readFileSync(new URL("./globals.css", import.meta.url), "utf8");

  it("pads the body with the top inset directly, not through a variable", () => {
    expect(css).toMatch(
      /body\s*\{[^}]*padding:\s*env\(safe-area-inset-top,\s*0px\)/,
    );
    expect(css).not.toContain("--coo-safe-top");
  });

  it.each(["right", "bottom", "left"])(
    "exposes the %s inset as a variable and pads the body with it",
    (side) => {
      expect(css).toMatch(
        new RegExp(
          `--coo-safe-${side}:\\s*env\\(safe-area-inset-${side},\\s*0px\\)`,
        ),
      );
      expect(css).toMatch(
        new RegExp(`body\\s*\\{[^}]*var\\(--coo-safe-${side}\\)`),
      );
    },
  );
});
