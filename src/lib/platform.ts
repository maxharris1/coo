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
  // Chrome, Firefox and Edge on iOS cannot add a web app to the home screen.
  /CriOS|FxiOS|EdgiOS/,
  /FBAN|FBAV/,
  /Instagram/,
  /Line\//,
  /MicroMessenger/,
  /Snapchat/,
  /TikTok|musical_ly|BytedanceWebview/,
  /Twitter/,
  /LinkedInApp/,
  /GSA\//,
  /; wv\)/,
];

type DeviceSnapshot = Pick<PlatformSnapshot, "userAgent" | "maxTouchPoints">;

const isIpadAskingForDesktopSite = ({
  userAgent,
  maxTouchPoints,
}: DeviceSnapshot) => /Macintosh/.test(userAgent) && maxTouchPoints > 1;

export const isIos = (s: DeviceSnapshot) =>
  /iPhone|iPad|iPod/.test(s.userAgent) || isIpadAskingForDesktopSite(s);

export function detectPlatform(s: PlatformSnapshot): Platform {
  const ua = s.userAgent;
  const ios = isIos(s);
  if (s.displayModeStandalone || s.navigatorStandalone) {
    return { kind: "installed" };
  }
  if (!ios && !/Android/.test(ua)) return { kind: "other" };
  if (IN_APP.some((token) => token.test(ua)) || (ios && !/Safari\//.test(ua))) {
    return { kind: "in-app", openIn: ios ? "Safari" : "Chrome" };
  }
  if (ios) return { kind: "ios-safari" };
  if (s.hasInstallPrompt) return { kind: "prompt" };
  if (/Chrome\//.test(ua)) return { kind: "prompt-pending" };
  return { kind: "other" };
}
