import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  blocks,
  declaration,
  type Env,
  px,
  read,
  type Ref,
  tabControls,
  tokens,
} from "../app/safeArea.testkit";

const HOME_INDICATOR = 34;
const INSETS = [0, 20, HOME_INDICATOR];
const BOTTOM_ENV = "env(safe-area-inset-bottom, 0px)";
const VIEWPORTS = [
  { name: "iPhone 390x844", height: 844 },
  { name: "iPhone 440x956", height: 956 },
];

const TAB_BAR = "components/TabBar.module.css";
const at = (file: string, rule: string, prop: string): Ref => ({
  file,
  rule,
  prop,
});
const BAND_HEIGHT = at(TAB_BAR, "band", "height");
const BAR_BOTTOM = at(TAB_BAR, "bar", "bottom");
const BAR_INSET = at(TAB_BAR, "bar", "padding-bottom");
const BAR_POSITION = at(TAB_BAR, "bar", "position");
const SPACER = at(
  "components/AppShell.module.css",
  "withTabs",
  "padding-bottom",
);
const RECIPIENTS_BAR = at(
  "app/(app)/send/Recipients.module.css",
  "bar",
  "bottom",
);
const BODY_PADDING = at("app/globals.css", "body", "padding");
const TABS_PAD = at("app/globals.css", "body", "--coo-tabs-pad");

const value = (ref: Ref, env: Env) => px(declaration(ref), env);
const barHeight = (env: Env) => value(BAND_HEIGHT, env) + value(BAR_INSET, env);
const rule = (name: string) => blocks(TAB_BAR, name).join("\n");

describe.each(VIEWPORTS)("tab bar on $name", ({ height }) => {
  const flat: Env = { top: 0, bottom: 0, height };
  const notched: Env = { top: 0, bottom: HOME_INDICATOR, height };

  it("is an 84px band with content cleared 12px above the bar", () => {
    expect(value(BAND_HEIGHT, flat)).toBe(84);
    expect(value(SPACER, flat) - barHeight(flat)).toBe(12);
  });

  it("paints down to the screen edge across the home-indicator band", () => {
    expect(value(BAR_BOTTOM, notched)).toBe(0);
    expect(barHeight(notched)).toBe(84 + HOME_INDICATOR);
    expect(value(BAR_INSET, notched)).toBe(HOME_INDICATOR);
  });

  it("keeps the tab labels above the home indicator", () => {
    expect(tabControls(notched).tabBottom).toBeLessThanOrEqual(
      height - HOME_INDICATOR,
    );
  });

  it("keeps the Send button on screen and above the home indicator", () => {
    const { sendTop, sendBottom } = tabControls(notched);
    expect(sendTop).toBeGreaterThanOrEqual(0);
    expect(sendBottom).toBeLessThanOrEqual(height - HOME_INDICATOR);
  });

  it.each(INSETS)(
    "paints the bar down to the screen edge over a %ipx inset",
    (bottom) => {
      const env: Env = { top: 0, bottom, height };
      expect(value(BAR_BOTTOM, env)).toBe(0);
      expect(value(BAR_INSET, env)).toBeGreaterThanOrEqual(bottom);
    },
  );

  it("keeps the icon row and Send button at one offset from the screen bottom for any inset", () => {
    const rows = INSETS.map((bottom) => {
      const { iconTop, sendTop } = tabControls({ top: 0, bottom, height });
      return [iconTop - height, sendTop - height];
    });
    for (const row of rows) expect(row).toEqual(rows[0]);
  });

  it("pads tab pages by the bar height plus a 12px gap", () => {
    for (const env of [flat, notched]) {
      expect(value(TABS_PAD, env) - barHeight(env)).toBe(12);
    }
  });

  it("clears the bar by the same margin with or without the inset", () => {
    for (const ref of [SPACER, RECIPIENTS_BAR]) {
      expect(value(ref, notched) - barHeight(notched), ref.file).toBe(
        value(ref, flat) - barHeight(flat),
      );
    }
  });
});

describe("home-indicator inset source", () => {
  it("pads the tab bar with env(safe-area-inset-bottom) directly", () => {
    expect(declaration(BAR_INSET)).toContain(BOTTOM_ENV);
  });

  it("keeps the icon band a constant 84px, independent of the inset", () => {
    expect(declaration(BAND_HEIGHT)).toBe("84px");
    expect(declaration(BAND_HEIGHT)).not.toContain("env(");
    expect(rule("bar")).not.toMatch(/(?<![\w-])(min-|max-)?height:/);
  });

  it("pads the body bottom with env(safe-area-inset-bottom) directly", () => {
    expect(tokens(declaration(BODY_PADDING))[2]).toBe(BOTTOM_ENV);
  });

  it("spaces content above the tab bar through --coo-tabs-pad on body", () => {
    expect(declaration(SPACER)).toBe("var(--coo-tabs-pad)");
    expect(declaration(RECIPIENTS_BAR)).toBe("var(--coo-tabs-pad)");
    expect(declaration(TABS_PAD)).toContain(BOTTOM_ENV);
    expect(read("app/globals.css")).not.toMatch(/:root\s*\{[^}]*--coo-/);
  });
});

describe("tab bar stays put while the browser toolbar animates", () => {
  it.each(["bar", "band", "tab", "icon", "send"])(
    ".%s has no transform, animation, or viewport-height unit",
    (name) => {
      const body = rule(name);
      expect(body).not.toMatch(/transform|transition|animation/);
      expect(body).not.toMatch(/\d(s|d)?vh\b/);
    },
  );

  it.each([
    ["tab", "width"],
    ["tab", "min-height"],
    ["icon", "width"],
    ["icon", "height"],
    ["send", "width"],
    ["send", "height"],
  ])(".%s %s is a fixed px size", (name, prop) => {
    expect(declaration(at(TAB_BAR, name, prop))).toMatch(/^\d+px$/);
  });

  it("never tracks the visual viewport or window resizes from app code", () => {
    const root = new URL("../", import.meta.url);
    const sources = ["app", "components"].flatMap((dir) =>
      (readdirSync(new URL(dir, root), { recursive: true }) as string[])
        .filter((f) => /\.tsx?$/.test(f) && !/\.test(kit)?\.tsx?$/.test(f))
        .map((f) => `${dir}/${f}`),
    );
    expect(sources.length).toBeGreaterThan(0);
    for (const file of sources) {
      expect(read(file), file).not.toMatch(
        /visualViewport|addEventListener\(\s*["'`]resize["'`]/,
      );
    }
  });
});

const PINS_TO_DOCUMENT =
  /(?<![-\w])(transform|translate|scale|rotate|filter|backdrop-filter|perspective|will-change|contain|container-type):/;
const SCROLLS = /(?<![-\w])overflow(-[xy])?: (?!visible)/;
const ruleBodies = (file: string, selector: string) =>
  [
    ...read(file).matchAll(
      new RegExp(`(?:^|\\n)\\s*${selector} \\{([^}]*)\\}`, "g"),
    ),
  ].map((m) => m[1]);

describe("tab bar while a tab page scrolls", () => {
  it.each([320, 390, 430, 599, 600, 1024])(
    "is fixed to the bottom of a %ipx-wide viewport",
    (width) => {
      expect(declaration(BAR_POSITION, width)).toBe("fixed");
      expect(declaration(BAR_BOTTOM, width)).toBe("0");
    },
  );

  it("centres without a transform, so iOS keeps it on the viewport", () => {
    const rules = ruleBodies(TAB_BAR, "\\.bar");
    expect(rules.length).toBeGreaterThan(0);
    for (const body of rules) expect(body).not.toMatch(PINS_TO_DOCUMENT);
  });

  it.each([
    ["app/globals.css", "html"],
    ["app/globals.css", "body"],
    ["components/AppShell.module.css", "\\.column"],
    ["components/AppShell.module.css", "\\.withTabs"],
  ])(
    "has no %s %s ancestor that carries it off with the document",
    (file, selector) => {
      const rules = ruleBodies(file, selector);
      expect(rules.length).toBeGreaterThan(0);
      for (const body of rules) {
        expect(body).not.toMatch(PINS_TO_DOCUMENT);
        expect(body).not.toMatch(SCROLLS);
      }
    },
  );
});
