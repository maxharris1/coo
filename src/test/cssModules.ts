import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = new URL("../../", import.meta.url);

export const CSS_MODULES = [
  "src/components/AppShell.module.css",
  "src/components/TabBar.module.css",
  "src/components/Toasts.module.css",
  "src/components/Loader.module.css",
  "src/components/MapView.module.css",
  "src/components/FlightLog.module.css",
  "src/components/TrackerDelay.module.css",
  "src/components/TrackerEarn.module.css",
  "src/components/Tracker.module.css",
  "src/app/OfflineBanner.module.css",
  "src/app/(app)/jobs/[id]/JobTracker.module.css",
];

export const readRepoFile = (path: string) =>
  readFileSync(new URL(path, ROOT), "utf8");

export const modulePath = (module: string, root = ROOT) =>
  fileURLToPath(new URL(module, root));

export const prefixOf = (module: string) =>
  module.replace(/^.*\//, "").replace(/\.module\.css$/, "");

function composed(css: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const [, name, parent] of css.matchAll(
    /\.([\w-]+) \{[^}]*composes: ([\w-]+);/g,
  )) {
    out.set(name, parent);
  }
  return out;
}

export function classNames(module: string): Record<string, string> {
  const prefix = prefixOf(module);
  const parents = composed(readRepoFile(module));
  return new Proxy({} as Record<string, string>, {
    get: (_, name) => {
      if (typeof name !== "string") return undefined;
      const own = `${prefix}__${name}`;
      const parent = parents.get(name);
      return parent ? `${own} ${prefix}__${parent}` : own;
    },
  });
}

function scopeSelectors(prelude: string, prefix: string) {
  return prelude.replace(
    /:global\(([^)]*)\)|\.(?![0-9])([\w-]+)/g,
    (_, global: string | undefined, name: string | undefined) =>
      global ?? `.${prefix}__${name}`,
  );
}

export function scopeCss(css: string, prefix: string): string {
  const src = css.replace(/composes:[^;]+;/g, "");
  let out = "";
  let mark = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c !== "{" && c !== "}") continue;
    const chunk = src.slice(mark, i);
    out +=
      c === "{" && !chunk.trimStart().startsWith("@")
        ? scopeSelectors(chunk, prefix)
        : chunk;
    out += c;
    mark = i + 1;
  }
  return out + src.slice(mark);
}
