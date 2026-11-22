import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "@/lib/config";
import type { Platform } from "@/lib/platform";
import type { UserId } from "@/server/ports/auth";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps } from "@/test/deps";
import { InstallView, installStep, type InstallScreen } from "./Install";

const { requireUser, redirect } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  redirect: vi.fn(),
}));
vi.mock("@/server/auth", () => ({ requireUser }));
vi.mock("next/navigation", () => ({ redirect, useRouter: () => ({}) }));

const render = (screen: InstallScreen, copied = false) =>
  renderToStaticMarkup(
    <InstallView
      screen={screen}
      copied={copied}
      onInstall={() => {}}
      onCopy={() => {}}
    />,
  ).replaceAll("&#x27;", "'");
const css = readFileSync(new URL("./page.module.css", import.meta.url), "utf8");
const rule = (cls: string) =>
  css.match(new RegExp(`\\.${cls} \\{[^}]*\\}`))?.[0];

describe("/welcome/install on iOS Safari (ac-4)", () => {
  const html = render({ kind: "ios" });

  it("shows the Install mock's heading and subline", () => {
    expect(html).toContain(">Step 1 of 3<");
    expect(html).toMatch(
      new RegExp(`<h1[^>]*>Put ${config.app.name} on your home screen</h1>`),
    );
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

  it("lists the three iPhone steps in order with their icons", () => {
    const steps = [...html.matchAll(/<li[^>]*>.*?<\/li>/gs)].map((m) => m[0]);
    expect(steps).toHaveLength(3);
    expect(steps[0]).toContain("Tap Share in your browser's toolbar");
    expect(steps[1]).toContain("Choose Add to Home Screen");
    expect(steps[2]).toContain(
      `Open ${config.app.name} from the new icon and say yes to notifications`,
    );
    for (const step of steps) expect(step).toContain("<svg");
  });

  it("points at the Share button", () => {
    expect(html).toContain(">Share is down here<");
  });

  it("offers the skip link to the next step", () => {
    expect(html).toMatch(
      /<a[^>]*href="\/welcome\/bird"[^>]*>Not now. Text me when birds land instead.<\/a>/,
    );
  });

  it("shows no install or copy button", () => {
    expect(html).not.toContain("<button");
  });
});

describe("/welcome/install on other platforms", () => {
  it("gives Android Chrome one Install button and no iPhone steps", () => {
    const html = render({ kind: "prompt" });
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Install<\/button>/);
    expect(html).not.toContain("<li");
    expect(html).not.toContain("Share is down here");
    expect(html).toContain(">Not now. Text me when birds land instead.<");
  });

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
    expect(html).toMatch(
      new RegExp(`<h1[^>]*>Put ${config.app.name} on your home screen</h1>`),
    );
    expect(html).not.toContain("<li");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("Share is down here");
  });
});

describe("'Not now. Text me when birds land instead.' (ac-3)", () => {
  const SKIP =
    /<a[^>]*href="\/welcome\/bird"[^>]*>Not now. Text me when birds land instead.<\/a>/;
  const screens: InstallScreen[] = [
    { kind: "detecting" },
    { kind: "ios" },
    { kind: "prompt" },
    { kind: "in-app", openIn: "Safari" },
  ];

  it.each(screens)("skips install from the %o screen", (screen) => {
    let installs = 0;
    const html = renderToStaticMarkup(
      <InstallView
        screen={screen}
        copied={false}
        onInstall={() => installs++}
        onCopy={() => {}}
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

describe("installStep", () => {
  const cases: [Platform, ReturnType<typeof installStep>][] = [
    [{ kind: "installed" }, { kind: "skip" }],
    [{ kind: "other" }, { kind: "skip" }],
    [{ kind: "ios-safari" }, { kind: "ios" }],
    [{ kind: "prompt" }, { kind: "prompt" }],
    [{ kind: "prompt-pending" }, { kind: "wait" }],
    [
      { kind: "in-app", openIn: "Chrome" },
      { kind: "in-app", openIn: "Chrome" },
    ],
  ];
  it.each(cases)("maps %o to %o", (platform, step) => {
    expect(installStep(platform)).toEqual(step);
  });
});

describe("/welcome/install page", () => {
  beforeEach(() => {
    requireUser.mockReset();
    redirect.mockReset();
  });

  const show = async (profile: object | null) => {
    requireUser.mockResolvedValue({ userId: "u1", profile });
    const { default: InstallPage } = await import("./page");
    return renderToStaticMarkup(await InstallPage());
  };

  it("shows the screen to an onboarded person who has not installed (ac-1)", async () => {
    const html = await show({ onboarded_at: new Date(0), installed: false });
    expect(redirect).not.toHaveBeenCalled();
    expect(html).toContain(`Put ${config.app.name} on your home screen`);
  });

  it("sends an onboarded person who has installed home (ac-2)", async () => {
    await show({ onboarded_at: new Date(0), installed: true });
    expect(redirect).toHaveBeenCalledWith("/");
  });

  it("skips to First bird for a new person who has installed (ac-2)", async () => {
    await show({ onboarded_at: null, installed: true });
    expect(redirect).toHaveBeenCalledWith("/welcome/bird");
  });

  it("shows the screen to a new person who has not installed (ac-3)", async () => {
    const html = await show({ onboarded_at: null, installed: false });
    expect(redirect).not.toHaveBeenCalled();
    expect(html).toContain(`Put ${config.app.name} on your home screen`);
  });

  it("shows the screen to a person with no profile yet (ac-3)", async () => {
    const html = await show(null);
    expect(redirect).not.toHaveBeenCalled();
    expect(html).toContain(`Put ${config.app.name} on your home screen`);
  });
});

describe("/welcome/install styles", () => {
  it("keeps every control at least the 44 px touch size", () => {
    for (const cls of ["skip", "action"]) {
      expect(rule(cls), `.${cls}`).toMatch(
        /min-(height|block-size): (var\(--coo-touch\)|4[4-9]px|[5-9]\dpx)/,
      );
    }
  });

  it("stops the hop and the pointer when the person asks for reduced motion", () => {
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[^@]*animation: none/,
    );
  });

  it("uses the mock's sky background", () => {
    expect(rule("page")).toContain("background: var(--coo-sky)");
  });
});
