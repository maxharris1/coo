import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = new URL("../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, src), "utf8");

const BLEED = "calc(-1 * var(--coo-safe-top))";

const BLEEDS: Record<string, string> = {
  "app/(app)/MainTop.module.css": "top",
  "app/(app)/shop/ShopTop.module.css": "awning",
};

function rule(css: string, name: string) {
  const body = css.match(new RegExp(`\\.${name} \\{([^}]*)\\}`))?.[1];
  if (body === undefined) throw new Error(`no .${name} rule`);
  return body;
}

const value = (body: string, prop: string) =>
  body.match(new RegExp(`(?:^|\\s)${prop}: ([^;]+);`))?.[1];

function withoutInsets(v: string | undefined) {
  if (v === undefined) return undefined;
  const flat = v.replaceAll("var(--coo-safe-top)", "0px");
  const sum = flat.match(/^calc\((-?\d+)px \+ 0px\)$/);
  if (sum) return `${sum[1]}px`;
  if (flat === "calc(-1 * 0px)") return "0px";
  return flat;
}

function moduleFiles(dir: string): string[] {
  return readdirSync(new URL(dir, src), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? moduleFiles(`${dir}${e.name}/`)
      : e.name.endsWith(".module.css")
        ? [`${dir}${e.name}`]
        : [],
  );
}

describe("Loft top", () => {
  const css = read("app/(app)/MainTop.module.css");
  const top = rule(css, "top");

  it("pulls the sky up under the status bar", () => {
    expect(value(top, "margin-top")).toBe(BLEED);
    expect(value(top, "background")).toBe("var(--coo-sky)");
  });

  it("pads the header back down by the same inset, so the controls clear the notch", () => {
    expect(value(top, "padding-top")).toBe("var(--coo-safe-top)");
    expect(value(rule(css, "header"), "padding")).toBe("20px 20px 0");
  });

  it("lays out as before when the inset is 0", () => {
    expect(withoutInsets(value(top, "margin-top"))).toBe("0px");
    expect(withoutInsets(value(top, "padding-top"))).toBe("0px");
  });
});

describe("Shop awning", () => {
  const css = read("app/(app)/shop/ShopTop.module.css");
  const awning = rule(css, "awning");

  it("pulls the stripes up under the status bar and grows by the inset", () => {
    expect(value(awning, "margin-top")).toBe(BLEED);
    expect(value(awning, "height")).toBe("calc(30px + var(--coo-safe-top))");
  });

  it("keeps the title and balance below the awning", () => {
    expect(value(rule(css, "header"), "padding")).toBe(
      "12px var(--coo-gutter) 0",
    );
  });

  it("is 30px tall with no offset when the inset is 0", () => {
    expect(withoutInsets(value(awning, "height"))).toBe("30px");
    expect(withoutInsets(value(awning, "margin-top"))).toBe("0px");
  });
});

describe("cream guard", () => {
  it("bleeds only the listed coloured tops", () => {
    const bleeding = moduleFiles("")
      .filter((f) => read(f).includes(BLEED))
      .sort();
    expect(bleeding).toEqual(Object.keys(BLEEDS).sort());
    for (const [file, name] of Object.entries(BLEEDS)) {
      expect(read(file).split(BLEED)).toHaveLength(2);
      expect(value(rule(read(file), name), "margin-top")).toBe(BLEED);
    }
  });

  it("keeps the app shell cream with no top offset", () => {
    const shell = read("components/AppShell.module.css");
    expect(value(rule(shell, "column"), "background")).toBe("var(--coo-paper)");
    expect(shell).not.toMatch(/padding-top|margin-top|safe-top/);
  });

  it("keeps the body padded on all four sides in the 430px column", () => {
    const body = read("app/globals.css").match(/\nbody \{([^}]*)\}/)![1];
    expect(value(body, "max-width")).toBe("430px");
    expect(value(body, "background")).toBe("var(--coo-paper)");
    expect(body).toMatch(
      /padding: var\(--coo-safe-top\) var\(--coo-safe-right\) var\(--coo-safe-bottom\)\s+var\(--coo-safe-left\);/,
    );
  });
});
