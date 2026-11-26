import { readFileSync } from "node:fs";

const src = new URL("../", import.meta.url);
export const read = (path: string) => readFileSync(new URL(path, src), "utf8");

export const GUTTER = Number(
  readFileSync(new URL("../public/assets/tokens.css", src), "utf8").match(
    /--coo-gutter: (\d+)px;/,
  )![1],
);

export type Env = { top: number; bottom: number; height: number };
export type Ref = { file: string; rule: string; prop: string };

type Decl = { prop: string; value: string; important: boolean };
type Rule = { selectors: string[]; media: string | null; decls: Decl[] };

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

function decls(body: string): Decl[] {
  return body.split(";").flatMap((d) => {
    const colon = d.indexOf(":");
    if (colon < 0) return [];
    const raw = squash(d.slice(colon + 1));
    const important = /!\s*important$/i.test(raw);
    const value = raw.replace(/\s*!\s*important$/i, "");
    return [{ prop: squash(d.slice(0, colon)), value, important }];
  });
}

function rules(file: string): Rule[] {
  const css = read(file).replace(/\/\*[\s\S]*?\*\//g, "");
  const out: Rule[] = [];
  const open: { prelude: string; start: number }[] = [];
  let mark = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === "{") {
      open.push({ prelude: squash(css.slice(mark, i)), start: i + 1 });
    } else if (c === "}") {
      const { prelude, start } = open.pop()!;
      const media = open.length === 1 ? open[0].prelude : null;
      const nestable = open.length === 0 || media?.startsWith("@media ");
      if (nestable && !prelude.startsWith("@")) {
        out.push({
          selectors: prelude.split(",").map(squash),
          media,
          decls: decls(css.slice(start, i)),
        });
      }
    }
    if (c === "{" || c === "}" || c === ";") mark = i + 1;
  }
  return out;
}

function applies(media: string | null, width: number) {
  if (media === null) return true;
  return media
    .replace(/^@media /, "")
    .split(" and ")
    .every((feature) => {
      const m = feature.match(/^\((min|max)-width: ?(\d+(?:\.\d+)?)px\)$/);
      if (!m) return false;
      return m[1] === "min" ? width >= +m[2] : width <= +m[2];
    });
}

export function declaration({ file, rule, prop }: Ref, width = 390) {
  const selector = rule === "body" ? "body" : `.${rule}`;
  const matching = rules(file).filter((r) => r.selectors.includes(selector));
  if (matching.length === 0) throw new Error(`no ${rule} rule in ${file}`);
  const found = matching
    .filter((r) => applies(r.media, width))
    .flatMap((r) => r.decls)
    .filter((d) => d.prop === prop);
  const winner = found.findLast((d) => d.important) ?? found[found.length - 1];
  if (winner === undefined) throw new Error(`no ${prop} on ${rule} in ${file}`);
  return winner.value;
}

export function tokens(shorthand: string) {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i <= shorthand.length; i++) {
    const c = shorthand[i];
    if (c === "(") depth++;
    if (c === ")") depth--;
    if ((c === " " || c === undefined) && depth === 0) {
      if (i > start) out.push(shorthand.slice(start, i));
      start = i + 1;
    }
  }
  return out;
}

export const firstToken = (shorthand: string) => tokens(shorthand)[0];

const TABS_PAD: Ref = {
  file: "app/globals.css",
  rule: "body",
  prop: "--coo-tabs-pad",
};

export function px(expr: string, { top, bottom, height }: Env) {
  const arithmetic = expr
    .replace(/var\(--coo-tabs-pad\)/g, () => declaration(TABS_PAD))
    .replace(/env\(safe-area-inset-top, 0px\)/g, `${top}px`)
    .replace(/var\(--coo-safe-top\)/g, `${top}px`)
    .replace(/env\(safe-area-inset-bottom, 0px\)/g, `${bottom}px`)
    .replace(/var\(--coo-safe-bottom(?:, 0px)?\)/g, `${bottom}px`)
    .replace(/var\(--coo-safe-\w+(?:, 0px)?\)/g, "0px")
    .replace(/env\(safe-area-inset-\w+(?:, 0px)?\)/g, "0px")
    .replace(/var\(--coo-gutter\)/g, `${GUTTER}px`)
    .replace(/(\d+(?:\.\d+)?)dvh/g, (_, n) => `${(+n * height) / 100}px`)
    .replace(/(\d+(?:\.\d+)?)px/g, "$1")
    .replace(/calc\(/g, "(");
  if (!/^(?:[\d\s.+\-*/(),]|max|min)*$/.test(arithmetic)) {
    throw new Error(`cannot evaluate ${expr}`);
  }
  return Function(
    `return ${arithmetic.replace(/\b(max|min)\(/g, "Math.$1(")};`,
  )() as number;
}
