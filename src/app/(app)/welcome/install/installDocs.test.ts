import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { detectPlatform } from "@/lib/platform";
import { snapshot, UA } from "@/test/fixtures/platform";
import { installFlow, installStep } from "./installFlow";

const doc = (name: string) =>
  readFileSync(
    new URL(`../../../../../docs/${name}`, import.meta.url),
    "utf8",
  ).replace(/\s+/g, " ");

const notifications = doc("10-notifications.md");
const screens = doc("07-screens.md");

const ANDROID: Record<string, string> = {
  Chrome: UA.androidChrome,
  Edge: UA.androidEdge,
  "Samsung Internet": UA.androidSamsung,
  Opera: UA.androidOpera,
  Firefox: UA.androidFirefox,
};

const IPHONE: Record<string, string> = {
  CriOS: UA.iphoneChrome,
  FxiOS: UA.iphoneFirefox,
  EdgiOS: UA.iphoneEdge,
};

const names = (list: string) =>
  list
    .replace(/ and other Chromium browsers$/, "")
    .split(/, | and /)
    .map((name) => name.trim());

describe("Home screen install docs on iPhone Chrome, Firefox and Edge", () => {
  it("say these browsers hand off to Safari, as detectPlatform does", () => {
    const tokens = notifications.match(
      /`detectPlatform` reads ((?:`\w+`(?:, | and ))+`\w+`) as in-app with `openIn: "(\w+)"`/,
    );
    expect(tokens, "documented iPhone browser tokens").not.toBeNull();
    const documented = [...tokens![1].matchAll(/`(\w+)`/g)].map((m) => m[1]);
    expect(documented).toEqual(Object.keys(IPHONE));
    for (const token of documented) {
      expect(detectPlatform(snapshot(IPHONE[token]))).toEqual({
        kind: "in-app",
        openIn: tokens![2],
      });
    }
  });

  it("do not claim only Safari can add a web app to the Home Screen", () => {
    expect(notifications).not.toMatch(/only Safari can add/i);
  });
});

describe("Home screen install docs on Android", () => {
  it.each([
    ["docs/10-notifications.md", notifications],
    ["docs/07-screens.md", screens],
  ])("%s names browsers that get the button and menu fallback", (_, text) => {
    const list = text.match(
      /Android browsers whose user agent carries `Chrome\/` \(([^)]+)\)/,
    )?.[1];
    expect(list, "documented Chromium browser list").toBeDefined();
    const documented = names(list!);
    expect(documented).toContain("Samsung Internet");
    for (const name of documented) {
      const platform = detectPlatform(snapshot(ANDROID[name]));
      const waiting = installStep(platform);
      expect(waiting, name).toEqual({ kind: "waiting" });
      const menu = installFlow(waiting, { type: "waitedOut" });
      expect(menu, name).toEqual({ kind: "menu" });
      expect(installFlow(menu, { type: "promptReady" }), name).toEqual({
        kind: "prompt",
      });
    }
    expect(text).not.toMatch(/Android Chrome (?:or|and) Edge/);
  });

  it.each([
    ["docs/10-notifications.md", notifications],
    ["docs/07-screens.md", screens],
  ])("%s names the Android browsers that skip, and they skip", (_, text) => {
    const skipped = text.match(
      /without `Chrome\/` in (?:the|its) user agent[^(]*\((\w+), for one\)/,
    )?.[1];
    expect(skipped, "documented Android browser that skips").toBeDefined();
    const ua = ANDROID[skipped!];
    expect(installStep(detectPlatform(snapshot(ua)))).toEqual({
      kind: "skip",
    });
    expect(
      installStep(detectPlatform(snapshot(ua, { hasInstallPrompt: true }))),
    ).toEqual({ kind: "prompt" });
  });
});
