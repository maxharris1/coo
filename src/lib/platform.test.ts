import { describe, expect, it } from "vitest";
import {
  detectPlatform,
  type Platform,
  type PlatformSnapshot,
} from "./platform";

const UA = {
  iphoneSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipadSafari:
    "Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  macSafari:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  iphoneChrome:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1",
  iphoneFirefox:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15",
  iphoneInstagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 337.0.3.23.54 (iPhone14,5; iOS 17_5; en_US; en; scale=3.00; 1170x2532; 614112440)",
  iphoneFacebook:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.40.108;FBBV/608516658;FBDV/iPhone14,5;FBMD/iPhone;FBSN/iOS;FBSV/17.5;FBSS/3;FBID/phone;FBLC/en_US;FBOP/5;FBRV/610477163]",
  iphoneWebView:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.71 Mobile Safari/537.36",
  androidInstagram:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP2A.240605.024; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.71 Mobile Safari/537.36 Instagram 337.0.0.35.102 Android (34/14; 420dpi; 1080x2400; Google/google; Pixel 8; shiba; shiba; en_US; 614112440)",
  androidFirefox:
    "Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0",
  desktopFirefox:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0",
  desktopChrome:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
};

const snapshot = (
  userAgent: string,
  flags: Partial<Omit<PlatformSnapshot, "userAgent">> = {},
): PlatformSnapshot => ({
  userAgent,
  displayModeStandalone: false,
  navigatorStandalone: false,
  hasInstallPrompt: false,
  maxTouchPoints: 0,
  ...flags,
});

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
  ["iPhone Chrome", snapshot(UA.iphoneChrome), { kind: "other" }],
  ["iPhone Firefox", snapshot(UA.iphoneFirefox), { kind: "other" }],
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
  ["Android Firefox", snapshot(UA.androidFirefox), { kind: "other" }],
  ["desktop Firefox", snapshot(UA.desktopFirefox), { kind: "other" }],
  [
    "desktop Chrome with an install prompt",
    snapshot(UA.desktopChrome, { hasInstallPrompt: true }),
    { kind: "prompt" },
  ],
  ["an empty user agent", snapshot(""), { kind: "other" }],
];

describe("detectPlatform (ac-5)", () => {
  it.each(cases)("reads %s", (_, input, expected) => {
    expect(detectPlatform(input)).toEqual(expected);
  });
});
