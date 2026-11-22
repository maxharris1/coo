export type Chrome = "bare" | "full" | "tabs";

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
