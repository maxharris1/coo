import { readdirSync, readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import AppLayout from "@/app/(app)/layout";
import {
  declaration,
  type Env,
  GUTTER,
  px,
  read,
  type Ref,
  tokens,
} from "../app/safeArea.testkit";
import { chromeFor } from "./shell";

const nav = vi.hoisted(() => ({ path: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.path }));

const STATUS_BAR = 59;
const HOME_INDICATOR = 34;
const VIEWPORTS = [
  { name: "390x844", height: 844 },
  { name: "440x956", height: 956 },
];
const INSETS = [HOME_INDICATOR, 0];

const at = (file: string, rule: string, prop: string): Ref => ({
  file,
  rule,
  prop,
});
const SHELL = "components/AppShell.module.css";
const BAR = "components/TabBar.module.css";
const FRIENDS = "app/(app)/friends/Friends.module.css";

const value = (ref: Ref, env: Env) => px(declaration(ref), env);
const TOUCH = Number(
  readFileSync(
    new URL("../../public/assets/tokens.css", import.meta.url),
    "utf8",
  ).match(/--coo-touch: (\d+)px;/)![1],
);
const LINE = 2.5;

function shell(env: Env) {
  const bodyPadding = tokens(
    declaration(at("app/globals.css", "body", "padding")),
  );
  const barHeight =
    value(at(BAR, "band", "height"), env) +
    value(at(BAR, "bar", "padding-bottom"), env);
  return {
    bodyMin: value(at("app/globals.css", "body", "min-height"), env),
    bodyTop: px(bodyPadding[0], env),
    bodyBottom: px(bodyPadding[2], env),
    shellMin: value(at(SHELL, "column", "min-height"), env),
    shellPad: value(at(SHELL, "withTabs", "padding-bottom"), env),
    barTop: env.height - value(at(BAR, "bar", "bottom"), env) - barHeight,
  };
}

function scroll(env: Env, contentHeight: number) {
  const s = shell(env);
  const shellHeight = Math.max(s.shellMin, contentHeight + s.shellPad);
  const docHeight = Math.max(s.bodyMin, s.bodyTop + shellHeight + s.bodyBottom);
  const maxScroll = docHeight - env.height;
  return {
    ...s,
    docHeight,
    maxScroll,
    bottomAt: (offset: number, scrollTop: number) =>
      s.bodyTop + offset - scrollTop,
  };
}

type Lines = { inviteTitle: number; inviteUrl: number; explain: number };
const TIGHT: Lines = { inviteTitle: 1, inviteUrl: 1, explain: 1 };
const LOOSE: Lines = { inviteTitle: 2, inviteUrl: 3, explain: 4 };

const friendsPx = (rule: string, prop: string) =>
  Number(declaration(at(FRIENDS, rule, prop)).replace(/px$/, ""));
const textLine = (rule: string) => {
  const size = friendsPx(rule, "font-size");
  const lh = /line-height/.test(
    read(FRIENDS).match(new RegExp(`\\.${rule} \\{([^}]*)\\}`))![1],
  )
    ? friendsPx(rule, "line-height")
    : 1.2;
  return size * lh;
};

function friendsPage(rows: number, lines: Lines) {
  const gap = friendsPx("screen", "gap");
  const header = TOUCH + 2 * LINE;
  const invite =
    2 * 12 +
    2 * LINE +
    lines.inviteTitle * textLine("inviteTitle") +
    lines.inviteUrl * textLine("inviteUrl") +
    friendsPx("action", "min-height") +
    2 * friendsPx("invite", "gap");
  const explain = lines.explain * textLine("explain");
  const listHead = textLine("count");
  const rowHeight = friendsPx("row", "min-height");
  const rowGap = friendsPx("rows", "gap");
  const list =
    listHead +
    friendsPx("list", "gap") +
    rows * rowHeight +
    (rows - 1) * rowGap;
  const lastRowBottom =
    GUTTER + header + gap + invite + gap + explain + gap + list;
  return { height: lastRowBottom + GUTTER, lastRowBottom };
}

describe.each(VIEWPORTS)("Friends on $name", ({ height }) => {
  describe.each([7, 20])(
    "with %i friends and a 34px home indicator",
    (rows) => {
      const env: Env = { top: STATUS_BAR, bottom: HOME_INDICATOR, height };
      const page = friendsPage(rows, TIGHT);
      const layout = scroll(env, page.height);

      it("scrolls", () => {
        expect(layout.maxScroll).toBeGreaterThan(0);
      });

      it("brings the last row fully above the tab bar and the home-indicator band", () => {
        const bottom = layout.bottomAt(page.lastRowBottom, layout.maxScroll);
        expect(bottom).toBeLessThanOrEqual(layout.barTop);
        expect(bottom).toBeLessThanOrEqual(height - HOME_INDICATOR);
        expect(layout.barTop).toBe(height - 84 - HOME_INDICATOR);
      });
    },
  );

  describe.each(INSETS)("with 1 friend and a %ipx home indicator", (bottom) => {
    const env: Env = { top: STATUS_BAR, bottom, height };

    it.each([
      ["short", TIGHT],
      ["wrapped", LOOSE],
    ])(
      "fills the screen exactly with %s text, so there is no scrollbar",
      (_, lines) => {
        const layout = scroll(env, friendsPage(1, lines).height);
        expect(layout.docHeight).toBe(height);
        expect(layout.maxScroll).toBe(0);
      },
    );

    it("keeps the row clear of the tab bar without scrolling", () => {
      const page = friendsPage(1, LOOSE);
      const layout = scroll(env, page.height);
      expect(layout.bottomAt(page.lastRowBottom, 0)).toBeLessThanOrEqual(
        layout.barTop,
      );
    });
  });

  it("has no nested scroller on the Friends screen", () => {
    for (const rule of ["screen", "list", "rows"]) {
      const body = read(FRIENDS).match(
        new RegExp(`\\.${rule} \\{([^}]*)\\}`),
      )![1];
      expect(body, rule).not.toMatch(
        /overflow|(?<![-\w])(max-)?height:|v?dvh|vh/,
      );
    }
  });
});

const APP = new URL("../app/(app)/", import.meta.url);

function routes(dir = APP, prefix = ""): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isFile()) return entry.name === "page.tsx" ? [prefix || "/"] : [];
    const segment = entry.name.replace(/^\[.+\]$/, "x");
    return routes(new URL(`${entry.name}/`, dir), `${prefix}/${segment}`);
  });
}

const TAB_ROUTES = routes().filter((path) => chromeFor(path) === "tabs");

const TOOLBAR_COLLAPSE = [0, 50, 83];

describe("the shell while the browser toolbar collapses", () => {
  describe.each(VIEWPORTS)("on $name", ({ height }) => {
    describe.each(INSETS)("with a %ipx home indicator", (bottom) => {
      it.each(TOOLBAR_COLLAPSE)(
        "keeps its size and the bar's top when the viewport grows by %ipx",
        (grow) => {
          const stable: Env = { top: STATUS_BAR, bottom, height };
          expect(shell({ ...stable, dvh: height + grow })).toEqual(
            shell(stable),
          );
        },
      );
    });
  });

  it.each([
    ["app/globals.css", "body"],
    [SHELL, "column"],
  ])("%s .%s sizes to the small viewport", (file, rule) => {
    const min = declaration(at(file, rule, "min-height"));
    expect(min).toContain("svh");
    expect(min).not.toContain("dvh");
  });
});

describe("every tab page", () => {
  it("covers the tab routes", () => {
    expect(TAB_ROUTES).toEqual(
      expect.arrayContaining([
        "/",
        "/friends",
        "/flights",
        "/sill",
        "/shop",
        "/settings",
      ]),
    );
  });

  it.each(TAB_ROUTES)("%s sits inside the shell's tab spacer", (path) => {
    nav.path = path;
    const html = renderToStaticMarkup(
      <AppLayout>
        <i>page</i>
      </AppLayout>,
    );
    expect(html).toMatch(/<div class="[^"]*withTabs[^"]*"><i>page<\/i><\/div>/);
  });

  describe.each(VIEWPORTS)("on $name", ({ height }) => {
    describe.each(INSETS)("with a %ipx home indicator", (bottom) => {
      const env: Env = { top: STATUS_BAR, bottom, height };

      it("ends any page's content above the bar at full scroll, with no scrollbar when it fits", () => {
        for (let content = 0; content <= 3 * height; content += 7) {
          const layout = scroll(env, content);
          const end = layout.bottomAt(content, layout.maxScroll);
          expect(end, `${content}px`).toBeLessThanOrEqual(layout.barTop - 12);
          expect(layout.docHeight >= height, `${content}px`).toBe(true);
          if (
            layout.bodyTop + content + layout.shellPad + layout.bodyBottom <=
            height
          ) {
            expect(layout.docHeight, `${content}px`).toBe(height);
          }
        }
      });
    });
  });

  it("adds no page-level spacer for the tab bar", () => {
    const css = (dir: URL): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? css(new URL(`${entry.name}/`, dir))
          : entry.name.endsWith(".module.css")
            ? [readFileSync(new URL(entry.name, dir), "utf8")]
            : [],
      );
    for (const sheet of css(APP)) {
      expect(sheet).not.toMatch(
        /(padding|margin)(-bottom)?:[^;]*(96px|84px|--coo-tabs-pad)/,
      );
    }
  });
});
