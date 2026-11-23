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

export function declaration({ file, rule, prop }: Ref) {
  const css = read(file);
  const selector = rule === "body" ? "\\nbody" : `\\.${rule}`;
  const body = css.match(new RegExp(`${selector} \\{([^}]*)\\}`))?.[1];
  if (body === undefined) throw new Error(`no ${rule} rule in ${file}`);
  const v = body.match(new RegExp(`(?<![\\w-])${prop}: ([^;]+);`))?.[1];
  if (v === undefined) throw new Error(`no ${prop} on ${rule} in ${file}`);
  return v.replace(/\s+/g, " ").trim();
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
