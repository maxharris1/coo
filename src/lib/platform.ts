export type PlatformSnapshot = {
  userAgent: string;
  displayModeStandalone: boolean;
  navigatorStandalone: boolean;
  hasInstallPrompt: boolean;
  maxTouchPoints: number;
};

export type Platform =
  | { kind: "installed" }
  | { kind: "ios-safari" }
  | { kind: "prompt" }
  | { kind: "prompt-pending" }
  | { kind: "in-app"; openIn: "Safari" | "Chrome" }
  | { kind: "other" };

const IN_APP = [
  /FBAN|FBAV/,
  /Instagram/,
  /Line\//,
  /MicroMessenger/,
  /Snapchat/,
  /TikTok|musical_ly|BytedanceWebview/,
  /; wv\)/,
];
const IOS_OTHER_BROWSER = /CriOS|FxiOS|EdgiOS/;

const isIpadAskingForDesktopSite = ({
  userAgent,
  maxTouchPoints,
}: PlatformSnapshot) => /Macintosh/.test(userAgent) && maxTouchPoints > 1;

const isIos = (s: PlatformSnapshot) =>
  /iPhone|iPad|iPod/.test(s.userAgent) || isIpadAskingForDesktopSite(s);

export function detectPlatform(s: PlatformSnapshot): Platform {
  const ua = s.userAgent;
  const ios = isIos(s);
  if (s.displayModeStandalone || s.navigatorStandalone) {
    return { kind: "installed" };
  }
  if (IN_APP.some((token) => token.test(ua)) || (ios && !/Safari\//.test(ua))) {
    return { kind: "in-app", openIn: ios ? "Safari" : "Chrome" };
  }
  if (ios) {
    return IOS_OTHER_BROWSER.test(ua)
      ? { kind: "other" }
      : { kind: "ios-safari" };
  }
  if (s.hasInstallPrompt) return { kind: "prompt" };
  if (/Android/.test(ua) && /Chrome\//.test(ua))
    return { kind: "prompt-pending" };
  return { kind: "other" };
}
