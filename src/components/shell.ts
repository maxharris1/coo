export type Chrome = "bare" | "full" | "tabs";

export type Top = "sky" | "sun" | "tomato" | "map" | "paper";

export type Canvas = "sun" | "sky" | "paper";

export const FULL_SCREEN_FLOWS = [
  { flow: "NewRecipient", pattern: /^\/send\/new$/ },
  { flow: "Compose", pattern: /^\/send\/write$/ },
  { flow: "Forecast", pattern: /^\/send\/forecast$/ },
  { flow: "Takeoff", pattern: /^\/send\/takeoff\/[^/]+$/ },
  { flow: "ShareLink", pattern: /^\/send\/share\/[^/]+$/ },
  { flow: "Landed", pattern: /^\/sill\/[^/]+$/ },
  { flow: "Reply", pattern: /^\/sill\/[^/]+\/reply$/ },
  { flow: "TakeoffHome", pattern: /^\/sill\/[^/]+\/takeoff$/ },
  { flow: "Incident report", pattern: /^\/flights\/[^/]+\/incident$/ },
] as const;

const COLOURED_TOPS = [
  { pattern: /^\/$/, top: "sky" },
  { pattern: /^\/shop$/, top: "tomato" },
  { pattern: /^\/sill\/[^/]+$/, top: "sky" },
  { pattern: /^\/send\/takeoff\/[^/]+$/, top: "sky" },
  { pattern: /^\/sill\/[^/]+\/takeoff$/, top: "sky" },
  { pattern: /^\/birds\/[^/]+$/, top: "sky" },
  { pattern: /^\/flights\/[^/]+$/, top: "map" },
  { pattern: /^\/welcome\/install$/, top: "sky", fill: true },
  { pattern: /^\/welcome(\/(bird|loft))?$/, top: "sun", fill: true },
  {
    pattern: /^\/(sign-in(\/verify)?|join\/[^/]+|offline|terms|privacy)$/,
    top: "sun",
    fill: true,
  },
  { pattern: /^\/b\/[^/]+$/, top: "sky" },
] as const satisfies readonly { pattern: RegExp; top: Top; fill?: true }[];

export function topFor(path: string): Top {
  return (
    COLOURED_TOPS.find(({ pattern }) => pattern.test(path))?.top ?? "paper"
  );
}

export function canvasFor(path: string): Canvas {
  const entry = COLOURED_TOPS.find(({ pattern }) => pattern.test(path));
  return entry && "fill" in entry ? entry.top : "paper";
}

export function chromeFor(path: string): Chrome {
  if (path === "/welcome" || path.startsWith("/welcome/")) return "bare";
  return FULL_SCREEN_FLOWS.some(({ pattern }) => pattern.test(path))
    ? "full"
    : "tabs";
}

export function isCurrentTab(href: string, path: string): boolean {
  return href === "/"
    ? path === "/" || path === "/more"
    : path === href || path.startsWith(`${href}/`);
}
