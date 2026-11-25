import { describe, expect, it } from "vitest";
import { snapshot, UA } from "@/test/fixtures/platform";
import {
  detectPlatform,
  type Platform,
  type PlatformSnapshot,
} from "./platform";

const cases: [string, PlatformSnapshot, Platform][] = [
  [
    "iPhone Safari",
    snapshot(UA.iphoneSafari, { maxTouchPoints: 5 }),
    { kind: "ios-safari" },
  ],
  [
    "iPhone Safari launched from the home screen",
    snapshot(UA.iphoneSafari, { navigatorStandalone: true }),
    { kind: "installed" },
  ],
  [
    "iPhone Safari in standalone display mode",
    snapshot(UA.iphoneSafari, { displayModeStandalone: true }),
    { kind: "installed" },
  ],
  [
    "iPad Safari",
    snapshot(UA.ipadSafari, { maxTouchPoints: 5 }),
    { kind: "ios-safari" },
  ],
  [
    "iPadOS Safari reporting a Mac user agent",
    snapshot(UA.macSafari, { maxTouchPoints: 5 }),
    { kind: "ios-safari" },
  ],
  ["Mac Safari", snapshot(UA.macSafari), { kind: "other" }],
  [
    "iPad Chrome asking for the desktop site",
    snapshot(UA.ipadChromeDesktopSite, { maxTouchPoints: 5 }),
    { kind: "in-app", openIn: "Safari" },
  ],
  [
    "iPhone Chrome",
    snapshot(UA.iphoneChrome),
    { kind: "in-app", openIn: "Safari" },
  ],
  [
    "iPhone Firefox",
    snapshot(UA.iphoneFirefox),
    { kind: "in-app", openIn: "Safari" },
  ],
  [
    "iPhone Edge",
    snapshot(UA.iphoneEdge),
    { kind: "in-app", openIn: "Safari" },
  ],
  [
    "iPhone Gmail",
    snapshot(UA.iphoneGmail),
    { kind: "in-app", openIn: "Safari" },
  ],
  ["iPhone X", snapshot(UA.iphoneX), { kind: "in-app", openIn: "Safari" }],
  [
    "iPhone LinkedIn",
    snapshot(UA.iphoneLinkedIn),
    { kind: "in-app", openIn: "Safari" },
  ],
  [
    "iPhone Google app",
    snapshot(UA.iphoneGoogleApp),
    { kind: "in-app", openIn: "Safari" },
  ],
  [
    "iPhone Instagram",
    snapshot(UA.iphoneInstagram),
    { kind: "in-app", openIn: "Safari" },
  ],
  [
    "iPhone Facebook",
    snapshot(UA.iphoneFacebook),
    { kind: "in-app", openIn: "Safari" },
  ],
  [
    "an iPhone WKWebView without Safari/",
    snapshot(UA.iphoneWebView),
    { kind: "in-app", openIn: "Safari" },
  ],
  [
    "Android Chrome with an install prompt",
    snapshot(UA.androidChrome, { hasInstallPrompt: true }),
    { kind: "prompt" },
  ],
  [
    "Android Chrome before the install prompt fires",
    snapshot(UA.androidChrome),
    { kind: "prompt-pending" },
  ],
  [
    "Android Chrome standalone with a prompt",
    snapshot(UA.androidChrome, {
      displayModeStandalone: true,
      hasInstallPrompt: true,
    }),
    { kind: "installed" },
  ],
  [
    "Android Instagram webview with a prompt",
    snapshot(UA.androidInstagram, { hasInstallPrompt: true }),
    { kind: "in-app", openIn: "Chrome" },
  ],
  [
    "Android LinkedIn webview",
    snapshot(UA.androidLinkedIn),
    { kind: "in-app", openIn: "Chrome" },
  ],
  ["Android Firefox", snapshot(UA.androidFirefox), { kind: "other" }],
  ["desktop Firefox", snapshot(UA.desktopFirefox), { kind: "other" }],
  [
    "desktop Chrome with an install prompt",
    snapshot(UA.desktopChrome, { hasInstallPrompt: true }),
    { kind: "other" },
  ],
  [
    "desktop Edge with an install prompt",
    snapshot(UA.desktopEdge, { hasInstallPrompt: true }),
    { kind: "other" },
  ],
  ["an empty user agent", snapshot(""), { kind: "other" }],
];

describe("detectPlatform (ac-4, ac-5)", () => {
  it.each(cases)("reads %s", (_, input, expected) => {
    expect(detectPlatform(input)).toEqual(expected);
  });
});
