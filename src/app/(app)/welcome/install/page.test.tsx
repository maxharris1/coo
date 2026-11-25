import { readFileSync } from "node:fs";
import {
  Children,
  type ComponentProps,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "@/lib/config";
import { detectPlatform, type PlatformSnapshot } from "@/lib/platform";
import type { UserId } from "@/server/ports/auth";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps } from "@/test/deps";
import { snapshot, UA } from "@/test/fixtures/platform";
import { InstallView } from "./Install";
import { installStep, type InstallState } from "./installFlow";

const { requireUser, redirect } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT ${to}`);
  }),
}));
vi.mock("@/server/auth", () => ({ requireUser }));
vi.mock("next/navigation", () => ({ redirect, useRouter: () => ({}) }));

const render = (state: InstallState, copied = false) =>
  renderToStaticMarkup(
    <InstallView
      state={state}
      copied={copied}
      onInstall={() => {}}
      onCopy={() => {}}
      onOpenSheet={() => {}}
      onCloseSheet={() => {}}
    />,
  ).replaceAll("&#x27;", "'");
const css = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");
const rule = (cls: string) =>
  css.match(new RegExp(`\\.${cls} \\{[^}]*\\}`))?.[0];
const HEADING = new RegExp(
  `<h1[^>]*>Put ${config.app.name} on your home screen</h1>`,
);
const SKIP =
  /<a[^>]*href="\/welcome\/loft"[^>]*>Not now. Text me when birds land instead.<\/a>/;
const MENU_FALLBACK = "Tap your browser's menu, then Install app";

const IOS_STEPS = [
  "Tap Share. If you don't see it, tap ••• first. Share is at the bottom in portrait and at the top right in landscape.",
  "Choose Add to Home Screen. Tap View More or scroll if it's hidden.",
  "Leave Open as Web App on, then tap Add.",
];

function dialogOf(html: string) {
  const start = html.lastIndexOf("<div", html.indexOf('role="dialog"'));
  const tags = /<(\/?)div\b[^>]*>/g;
  tags.lastIndex = start;
  let depth = 0;
  for (let m = tags.exec(html); m; m = tags.exec(html)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, tags.lastIndex);
  }
  throw new Error("no dialog in markup");
}

type El = ReactElement<{
  children?: ReactNode;
  role?: string;
  "aria-label"?: string;
  onClick?: () => void;
  onKeyDown?: (e: { key: string }) => void;
}>;

function find(node: ReactNode, hit: (el: El) => boolean): El | undefined {
  if (!isValidElement<El["props"]>(node)) return undefined;
  if (hit(node)) return node;
  for (const child of Children.toArray(node.props.children)) {
    const found = find(child, hit);
    if (found) return found;
  }
  return undefined;
}

const tree = (props: ComponentProps<typeof InstallView>) => {
  let out: ReactNode = null;
  function Probe() {
    out = InstallView(props);
    return null;
  }
  renderToStaticMarkup(<Probe />);
  return out;
};

describe("/welcome/install on iOS Safari (ac-3)", () => {
  describe("with the guide closed", () => {
    const html = render({ kind: "ios", sheet: "closed" });

    it("shows the Install mock's heading and subline", () => {
      expect(html).toContain(">Step 2 of 3<");
      expect(html).toMatch(HEADING);
      expect(html).toContain(
        "It opens full screen like any other app, and it is how your phone tells you a bird has landed.",
      );
    });

    it("draws the home screen with the app icon as one labelled picture", () => {
      expect(html).toContain(
        `role="img" aria-label="The ${config.app.name} icon sitting on a phone home screen among other apps"`,
      );
      expect(html).toMatch(new RegExp(`>${config.app.name}</[a-z]+>`));
    });

    it("offers one Install button and the skip link", () => {
      expect(html.match(/<button/g)).toHaveLength(1);
      expect(html).toMatch(/<button[^>]*type="button"[^>]*>Install<\/button>/);
      expect(html).toMatch(SKIP);
    });

    it("keeps the steps and the old Share pointer off the page", () => {
      expect(html).not.toContain('role="dialog"');
      expect(html).not.toContain("<li");
      expect(html).not.toContain("Share is down here");
    });
  });

  describe("with the guide open", () => {
    const html = render({ kind: "ios", sheet: "open" });
    const dialog = dialogOf(html);

    it("opens a modal dialog titled for the home screen", () => {
      expect(dialog).toContain('aria-modal="true"');
      const id = dialog.match(/aria-labelledby="([^"]+)"/)?.[1];
      expect(id).toBeTruthy();
      expect(dialog).toContain(`<h2 id="${id}"`);
      expect(dialog).toMatch(
        new RegExp(`<h2[^>]*>Add ${config.app.name} to your home screen</h2>`),
      );
    });

    it("lists the three iPhone steps in order with their icons", () => {
      const steps = [...dialog.matchAll(/<li[^>]*>.*?<\/li>/gs)].map(
        (m) => m[0],
      );
      expect(steps).toHaveLength(3);
      steps.forEach((step, i) => {
        expect(step).toContain(IOS_STEPS[i]);
        expect(step).toContain("<svg");
      });
    });

    it("points at the Share icon in the first step", () => {
      const share = dialog.match(/<li[^>]*>.*?<\/li>/s)?.[0];
      expect(share).toContain("animation:coo-point");
    });

    it("closes from the backdrop or a visible Close button", () => {
      expect(html).toMatch(
        /<button type="button" aria-label="Close"[^>]*><\/button>/,
      );
      expect(dialog).toMatch(/<button[^>]*type="button"[^>]*>Close<\/button>/);
    });

    it("keeps the Install button and the skip link outside the sheet", () => {
      expect(html).toMatch(/<button[^>]*>Install<\/button>/);
      expect(html).toMatch(SKIP);
      expect(dialog).not.toMatch(SKIP);
      expect(dialog).not.toContain(">Install<");
    });
  });

  describe("wiring", () => {
    const spies = (sheet: "open" | "closed") => {
      const onOpenSheet = vi.fn();
      const onCloseSheet = vi.fn();
      const node = tree({
        state: { kind: "ios", sheet },
        copied: false,
        onInstall: () => {},
        onCopy: () => {},
        onOpenSheet,
        onCloseSheet,
      });
      return { node, onOpenSheet, onCloseSheet };
    };

    it("opens the guide from Install", () => {
      const { node, onOpenSheet, onCloseSheet } = spies("closed");
      find(node, (el) => el.props.children === "Install")?.props.onClick?.();
      expect(onOpenSheet).toHaveBeenCalledOnce();
      expect(onCloseSheet).not.toHaveBeenCalled();
    });

    it.each<[string, (el: El) => boolean]>([
      ["the backdrop", (el) => el.props["aria-label"] === "Close"],
      ["the Close button", (el) => el.props.children === "Close"],
    ])("closes the guide from %s", (_, hit) => {
      const { node, onOpenSheet, onCloseSheet } = spies("open");
      find(node, hit)?.props.onClick?.();
      expect(onCloseSheet).toHaveBeenCalledOnce();
      expect(onOpenSheet).not.toHaveBeenCalled();
    });

    it("closes the guide on Escape and ignores other keys", () => {
      const { node, onCloseSheet } = spies("open");
      const dialog = find(node, (el) => el.props.role === "dialog");
      dialog?.props.onKeyDown?.({ key: "Tab" });
      expect(onCloseSheet).not.toHaveBeenCalled();
      dialog?.props.onKeyDown?.({ key: "Escape" });
      expect(onCloseSheet).toHaveBeenCalledOnce();
    });
  });
});

describe("/welcome/install on Android Chrome and Edge (ac-1)", () => {
  it("gives one Install button and no iPhone steps once the prompt is ready", () => {
    const html = render({ kind: "prompt" });
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Install<\/button>/);
    expect(html).not.toContain("<li");
    expect(html).not.toContain("Share is down here");
    expect(html).toMatch(SKIP);
  });

  it("shows only the heading and skip link while it waits for the prompt", () => {
    const html = render({ kind: "waiting" });
    expect(html).toMatch(HEADING);
    expect(html).toMatch(SKIP);
    expect(html).not.toContain("<button");
    expect(html).not.toContain(MENU_FALLBACK);
  });

  it("shows no Install button when already running standalone", () => {
    const standalone = snapshot(UA.androidChrome, {
      displayModeStandalone: true,
      hasInstallPrompt: true,
    });
    expect(render(installStep(detectPlatform(standalone)))).not.toContain(
      "<button",
    );
  });
});

describe("/welcome/install browser-menu fallback (ac-2)", () => {
  const html = render({ kind: "menu" });

  it("tells the person to install from the browser menu", () => {
    expect(html).toContain(MENU_FALLBACK);
  });

  it("keeps the heading and skip link and drops the dead Install button", () => {
    expect(html).toMatch(HEADING);
    expect(html).toMatch(SKIP);
    expect(html).not.toContain("<button");
  });
});

describe("/welcome/install on other platforms", () => {
  it("asks in-app browsers to open Safari first with a copy-link button", () => {
    const html = render({ kind: "in-app", openIn: "Safari" });
    expect(html).toContain("Open this in Safari first");
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Copy link<\/button>/);
    expect(html).not.toContain("<li");
  });

  it("names Chrome for in-app browsers on Android", () => {
    expect(render({ kind: "in-app", openIn: "Chrome" })).toContain(
      "Open this in Chrome first",
    );
  });

  it("says the link was copied after a copy", () => {
    expect(render({ kind: "in-app", openIn: "Safari" }, true)).toMatch(
      /<button[^>]*>Link copied<\/button>/,
    );
  });

  it("renders the heading alone while it detects the platform", () => {
    const html = render({ kind: "detecting" });
    expect(html).toMatch(HEADING);
    expect(html).not.toContain("<li");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Share is down here");
  });
});

describe("'Not now. Text me when birds land instead.' (ac-3)", () => {
  const states: InstallState[] = [
    { kind: "detecting" },
    { kind: "waiting" },
    { kind: "prompt" },
    { kind: "menu" },
    { kind: "ios", sheet: "closed" },
    { kind: "ios", sheet: "open" },
    { kind: "in-app", openIn: "Safari" },
    { kind: "skip" },
    { kind: "done" },
  ];

  it.each(states)("skips install from the %o state", (state) => {
    let installs = 0;
    const html = renderToStaticMarkup(
      <InstallView
        state={state}
        copied={false}
        onInstall={() => installs++}
        onCopy={() => {}}
        onOpenSheet={() => {}}
        onCloseSheet={() => {}}
      />,
    );
    expect(html).toMatch(SKIP);
    expect(installs).toBe(0);
  });

  it("leaves sms_fallback on for the person who skips", async () => {
    const deps = await makeTestDeps();
    const [{ id }] = await deps.db.query<{ id: UserId }>(
      "insert into auth.users default values returning id",
    );

    await onboard(deps, id, {
      name: "Max",
      timezone: "America/New_York",
      bird: { name: "Gerald", look: "gerald", pronoun: "he" },
    });

    const [{ sms_fallback }] = await deps.db.query<{ sms_fallback: boolean }>(
      "select sms_fallback from profiles where id = $1",
      [id],
    );
    expect(sms_fallback).toBe(true);
  });
});

describe("installStep (ac-4, ac-5)", () => {
  const SAFARI_FIRST = { kind: "in-app", openIn: "Safari" } as const;
  const browsers: [string, InstallState, PlatformSnapshot][] = [
    ["Android Chrome", { kind: "waiting" }, snapshot(UA.androidChrome)],
    ["desktop Edge", { kind: "skip" }, snapshot(UA.desktopEdge)],
    ["iPhone Chrome", SAFARI_FIRST, snapshot(UA.iphoneChrome)],
    ["iPhone Firefox", SAFARI_FIRST, snapshot(UA.iphoneFirefox)],
    ["iPhone Edge", SAFARI_FIRST, snapshot(UA.iphoneEdge)],
    ["iPhone Instagram", SAFARI_FIRST, snapshot(UA.iphoneInstagram)],
    ["iPhone Gmail", SAFARI_FIRST, snapshot(UA.iphoneGmail)],
    [
      "Android Instagram",
      { kind: "in-app", openIn: "Chrome" },
      snapshot(UA.androidInstagram),
    ],
    [
      "desktop Chrome with an install prompt",
      { kind: "skip" },
      snapshot(UA.desktopChrome, { hasInstallPrompt: true }),
    ],
    ["desktop Firefox", { kind: "skip" }, snapshot(UA.desktopFirefox)],
    [
      "iPad Safari",
      { kind: "ios", sheet: "closed" },
      snapshot(UA.ipadSafari, { maxTouchPoints: 5 }),
    ],
    [
      "iPad Safari asking for the desktop site",
      { kind: "ios", sheet: "closed" },
      snapshot(UA.macSafari, { maxTouchPoints: 5 }),
    ],
  ];
  it.each(browsers)("gives %s the %o state", (_, state, browser) => {
    expect(installStep(detectPlatform(browser))).toEqual(state);
  });
});

describe("/welcome/install page", () => {
  beforeEach(() => {
    requireUser.mockReset();
    redirect.mockClear();
  });

  const show = async (profile: object | null) => {
    requireUser.mockResolvedValue({ userId: "u1", profile });
    const { default: InstallPage } = await import("./page");
    return renderToStaticMarkup(await InstallPage());
  };
  const redirectsTo = async (profile: object | null, to: string) => {
    await expect(show(profile)).rejects.toThrow(`NEXT_REDIRECT ${to}`);
    expect(redirect).toHaveBeenCalledExactlyOnceWith(to);
  };

  it("shows the screen to an onboarded person who has not installed (ac-1)", async () => {
    const html = await show({ onboarded_at: new Date(0), installed: false });
    expect(redirect).not.toHaveBeenCalled();
    expect(html).toContain(`Put ${config.app.name} on your home screen`);
  });

  it("sends an onboarded person who has installed home (ac-2)", async () => {
    await redirectsTo({ onboarded_at: new Date(0), installed: true }, "/");
  });

  it("skips to the loft for a new person who has installed (ac-2)", async () => {
    await redirectsTo({ onboarded_at: null, installed: true }, "/welcome/loft");
  });

  it("shows the screen to a new person who has not installed (ac-3)", async () => {
    const html = await show({ onboarded_at: null, installed: false });
    expect(redirect).not.toHaveBeenCalled();
    expect(html).toContain(`Put ${config.app.name} on your home screen`);
  });

  it("sends a person with no profile yet to First bird first", async () => {
    await redirectsTo(null, "/welcome/bird");
  });
});

describe("/welcome/install styles", () => {
  it("keeps every control at least the 44 px touch size", () => {
    for (const cls of ["skip", "action", "close"]) {
      expect(rule(cls), `.${cls}`).toMatch(
        /min-(height|block-size): (var\(--coo-touch\)|4[4-9]px|[5-9]\dpx)/,
      );
    }
  });

  it("slides the guide up", () => {
    const name = rule("sheet")?.match(/animation: ([\w-]+)/)?.[1];
    expect(name).toBeTruthy();
    expect(css).toContain(`@keyframes ${name} {`);
  });

  it("stops the hop, the Share pointer and the slide when the person asks for reduced motion", () => {
    const block = css.match(
      /@media \(prefers-reduced-motion: reduce\) \{([^@]*)\}\s*$/,
    )?.[1];
    for (const cls of ["hop", "point", "sheet"]) {
      expect(block, `.${cls}`).toMatch(new RegExp(`\\.${cls}\\b`));
    }
    expect(block).toContain("animation: none !important");
  });

  it("uses the mock's sky background", () => {
    expect(rule("page")).toContain("background: var(--coo-sky)");
  });
});
