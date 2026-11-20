export function normaliseMarkup(
  markup: string,
  { skipRootPresentation = false } = {},
): string[] {
  const body = markup.replace(/<style>[\s\S]*?<\/style>/g, "");
  const out: string[] = [];
  let root = skipRootPresentation;
  for (const [, text, close, name, attrs, selfClose] of body.matchAll(
    /([^<]*)(?:<(\/?)([\w:-]+)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>)?/g,
  )) {
    const t = text.replace(/\s+/g, " ").trim();
    if (t) out.push(`#text ${t}`);
    if (!name) continue;
    if (close) {
      out.push(`</${name}>`);
      continue;
    }
    const pairs = [...attrs.matchAll(/([\w:-]+)="([^"]*)"/g)]
      .filter(([, k]) => !(root && PRESENTATION(k)))
      .map(([, k, v]) => `${k}="${k === "style" ? style(v) : squash(v)}"`)
      .sort();
    root = false;
    out.push(`<${name} ${pairs.join(" ")}>`);
    if (selfClose) out.push(`</${name}>`);
  }
  return out;
}

const PRESENTATION = (name: string) =>
  name === "role" || name === "style" || name.startsWith("aria-");

const squash = (s: string) => s.replace(/\s+/g, " ").trim();

const style = (css: string) =>
  css
    .split(";")
    .map((d) => d.split(":").map(squash).join(":"))
    .filter(Boolean)
    .join("; ");
