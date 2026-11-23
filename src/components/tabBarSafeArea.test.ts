import { describe, expect, it } from "vitest";
import {
  declaration,
  type Env,
  px,
  read,
  type Ref,
  tokens,
} from "../app/safeArea.testkit";

const HOME_INDICATOR = 34;
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
const BAR_HEIGHT = at(TAB_BAR, "bar", "height");
const BAR_BOTTOM = at(TAB_BAR, "bar", "bottom");
const BAR_PADDING = at(TAB_BAR, "bar", "padding");
const TAB_HEIGHT = at(TAB_BAR, "tab", "min-height");
const SEND_HEIGHT = at(TAB_BAR, "send", "height");
const SEND_MARGIN = at(TAB_BAR, "send", "margin-top");
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
const padding = (env: Env) =>
  tokens(declaration(BAR_PADDING)).map((t) => px(t, env));

function layout(env: Env) {
  const barTop = env.height - value(BAR_BOTTOM, env) - value(BAR_HEIGHT, env);
  const contentTop = barTop + padding(env)[0];
  const sendTop = contentTop + value(SEND_MARGIN, env);
  return {
    tabBottom: contentTop + value(TAB_HEIGHT, env),
    sendTop,
    sendBottom: sendTop + value(SEND_HEIGHT, env),
  };
}

describe.each(VIEWPORTS)("tab bar on $name", ({ height }) => {
  const flat: Env = { top: 0, bottom: 0, height };
  const notched: Env = { top: 0, bottom: HOME_INDICATOR, height };

  it("is 84px tall over a 96px content spacer with no inset", () => {
    expect(value(BAR_HEIGHT, flat)).toBe(84);
    expect(value(SPACER, flat)).toBe(96);
  });

  it("paints down to the screen edge across the home-indicator band", () => {
    expect(value(BAR_BOTTOM, notched)).toBe(0);
    expect(value(BAR_HEIGHT, notched)).toBe(84 + HOME_INDICATOR);
    expect(padding(notched)[2]).toBe(HOME_INDICATOR);
  });

  it("keeps the tab labels above the home indicator", () => {
    expect(layout(notched).tabBottom).toBeLessThanOrEqual(
      height - HOME_INDICATOR,
    );
  });

  it("keeps the Send button on screen and above the home indicator", () => {
    const { sendTop, sendBottom } = layout(notched);
    expect(sendTop).toBeGreaterThanOrEqual(0);
    expect(sendBottom).toBeLessThanOrEqual(height - HOME_INDICATOR);
  });

  it("lays out the tabs and Send button the same with or without the inset", () => {
    const shift = (env: Env) => {
      const { tabBottom, sendTop } = layout(env);
      return [tabBottom - height + env.bottom, sendTop - height + env.bottom];
    };
    expect(shift(notched)).toEqual(shift(flat));
  });

  it("clears the bar by the same margin with or without the inset", () => {
    for (const ref of [SPACER, RECIPIENTS_BAR]) {
      expect(value(ref, notched) - value(BAR_HEIGHT, notched), ref.file).toBe(
        value(ref, flat) - value(BAR_HEIGHT, flat),
      );
    }
  });
});

describe("home-indicator inset source", () => {
  it("sizes and pads the tab bar with env(safe-area-inset-bottom) directly", () => {
    expect(declaration(BAR_HEIGHT)).toContain(BOTTOM_ENV);
    expect(tokens(declaration(BAR_PADDING))[2]).toBe(BOTTOM_ENV);
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
