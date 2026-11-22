import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";

type Segment = string | null;
type Edge = { from: string; to: string };
type Facts = { imports: string[]; links: string[]; apiCalls: string[] };

const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const SRC = join(ROOT, "src");
const APP = join(SRC, "app");
const ROUTE =
  /^\/(?:(?:[a-z0-9-]+|\[[a-z]+\])(?:\/(?:[a-z0-9-]+|\[[a-z]+\]))*)?$/;
const HOLE = "\0";

function parseRoute(token: string): string {
  if (!ROUTE.test(token))
    throw new Error(`navigation summary: bad route "${token}"`);
  return token;
}

function readNavigation(): { routes: string[]; edges: Edge[] } {
  const doc = readFileSync(join(ROOT, "docs/07-screens.md"), "utf8");
  const block = doc.match(/^## Navigation summary\s*\n+```\n([\s\S]*?)\n```/m);
  if (!block)
    throw new Error(
      "docs/07-screens.md: no fenced block under ## Navigation summary",
    );
  const routes = new Set<string>();
  const edges = new Map<string, Edge>();
  const link = (from: string, to: string) =>
    edges.set(`${from} ${to}`, { from, to });

  for (const raw of block[1].split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (line.includes("↔")) {
      const tabs = line.match(/^(.*?)\s+\(tabs\)$/);
      if (!tabs)
        throw new Error(
          `navigation summary: tab line without (tabs): "${line}"`,
        );
      const nodes = tabs[1].split("↔").map((t) => parseRoute(t.trim()));
      nodes.forEach((r) => routes.add(r));
      nodes.slice(1).forEach((r, i) => {
        link(nodes[i], r);
        link(r, nodes[i]);
      });
    } else if (line.includes("→")) {
      const nodes = line.split("→").map((t) => {
        const token = t.trim();
        const optional = token.match(/^\((.*)\)$/);
        const names = (optional ? optional[1] : token).split("|");
        return {
          optional: !!optional,
          routes: names.map((n) => parseRoute(n.trim())),
        };
      });
      nodes.forEach((n) => n.routes.forEach((r) => routes.add(r)));
      nodes.forEach((from, i) => {
        for (const to of nodes.slice(i + 1)) {
          from.routes.forEach((a) => to.routes.forEach((b) => link(a, b)));
          if (!to.optional) break;
        }
      });
    } else {
      const tokens = line.split(/\s+/);
      if (tokens.length % 2 !== 0)
        throw new Error(`navigation summary: cannot read "${line}"`);
      for (let i = 0; i < tokens.length; i += 2) {
        if (tokens[i + 1] !== "(public)")
          throw new Error(
            `navigation summary: unknown annotation "${tokens[i + 1]}"`,
          );
        routes.add(parseRoute(tokens[i]));
      }
    }
  }
  return { routes: [...routes], edges: [...edges.values()] };
}

const segments = (route: string): Segment[] =>
  route
    .split("/")
    .filter((s) => s && !/^\(.*\)$/.test(s))
    .map((s) => (/^\[.*\]$/.test(s) || s.includes(HOLE) ? null : s));

const linkSegments = (link: string) => segments(link.split(/[?#]/)[0]);

const matches = (pattern: Segment[], target: Segment[]) =>
  pattern.length === target.length &&
  pattern.every((s, i) => s === null || s === target[i]);

const isTest = (file: string) => /\.test\.tsx?$/.test(file);

function sourceFiles(dir: string, name: RegExp): string[] {
  return readdirSync(dir, { recursive: true, encoding: "utf8" })
    .filter((f) => name.test(f.split("/").pop() ?? ""))
    .map((f) => join(dir, f));
}

const PAGES = sourceFiles(APP, /^page\.tsx$/)
  .filter((f) => !relative(APP, f).startsWith("api/"))
  .map((file) => ({ file, segments: segments(dirname(relative(APP, file))) }));
const API_ROUTES = sourceFiles(join(APP, "api"), /^route\.ts$/).map((file) => ({
  file,
  segments: segments(dirname(relative(APP, file))),
}));

const pageFor = (route: string) =>
  PAGES.find((p) => matches(p.segments, segments(route)))?.file;

function pathText(node: ts.Node): string | null {
  const text =
    ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
      ? node.text
      : ts.isTemplateExpression(node)
        ? node.head.text +
          node.templateSpans.map((s) => HOLE + s.literal.text).join("")
        : null;
  return text?.startsWith("/") && !text.startsWith("//") ? text : null;
}

const isApi = (path: string) => /^\/api(?:[/?#]|$)/.test(path);
const isLinkName = (name: string) => name === "href" || name.endsWith("Href");

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith("@/")
    ? join(SRC, spec.slice(2))
    : spec.startsWith(".")
      ? join(dirname(from), spec)
      : null;
  if (!base) return null;
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
  ];
  return candidates.find((c) => /\.tsx?$/.test(c) && existsSync(c)) ?? null;
}

const factsCache = new Map<string, Facts>();

function factsOf(file: string): Facts {
  const cached = factsCache.get(file);
  if (cached) return cached;
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const bindings = new Map<string, ts.Node>();
  const collect = (node: ts.Node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    )
      bindings.set(node.name.text, node.initializer);
    ts.forEachChild(node, collect);
  };
  collect(source);

  const returns = (body: ts.Node): ts.Node[] => {
    const found: ts.Node[] = [];
    const walk = (node: ts.Node) => {
      if (ts.isReturnStatement(node) && node.expression)
        found.push(node.expression);
      else if (!ts.isFunctionLike(node)) ts.forEachChild(node, walk);
    };
    ts.forEachChild(body, walk);
    return found;
  };

  const resolve = (node: ts.Node, seen: Set<string> = new Set()): string[] => {
    const path = pathText(node);
    if (path !== null) return [path];
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node) ||
      ts.isJsxExpression(node)
    )
      return node.expression ? resolve(node.expression, seen) : [];
    if (ts.isConditionalExpression(node))
      return [
        ...resolve(node.whenTrue, seen),
        ...resolve(node.whenFalse, seen),
      ];
    if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken ||
        node.operatorToken.kind === ts.SyntaxKind.BarBarToken)
    )
      return [...resolve(node.left, seen), ...resolve(node.right, seen)];
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node))
      return ts.isBlock(node.body)
        ? returns(node.body).flatMap((r) => resolve(r, seen))
        : resolve(node.body, seen);
    if (ts.isIdentifier(node) && !seen.has(node.text)) {
      const bound = bindings.get(node.text);
      return bound ? resolve(bound, new Set([...seen, node.text])) : [];
    }
    return [];
  };

  const facts: Facts = { imports: [], links: [], apiCalls: [] };
  const visit = (node: ts.Node) => {
    if (ts.isTypeNode(node)) return;
    const path = pathText(node);
    if (path !== null && isApi(path)) facts.apiCalls.push(path);

    if (
      (ts.isImportDeclaration(node) && !node.importClause?.isTypeOnly) ||
      (ts.isExportDeclaration(node) && !node.isTypeOnly)
    ) {
      const spec = node.moduleSpecifier;
      const target =
        spec && ts.isStringLiteral(spec)
          ? resolveImport(file, spec.text)
          : null;
      if (target && !isTest(target)) facts.imports.push(target);
    }

    const sinks: ts.Node[] = [];
    if (
      ts.isJsxAttribute(node) &&
      isLinkName(node.name.getText()) &&
      node.initializer
    )
      sinks.push(node.initializer);
    if (
      ts.isPropertyAssignment(node) &&
      (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) &&
      (isLinkName(node.name.text) || node.name.text === "next")
    )
      sinks.push(node.initializer);
    if (ts.isShorthandPropertyAssignment(node) && isLinkName(node.name.text))
      sinks.push(node.name);
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      isLinkName(node.name.text) &&
      node.initializer
    )
      sinks.push(node.initializer);
    if (
      ts.isFunctionDeclaration(node) &&
      node.name &&
      isLinkName(node.name.text) &&
      node.body
    )
      sinks.push(...returns(node.body));
    if (ts.isCallExpression(node) && node.arguments[0]) {
      const callee = node.expression;
      const name = ts.isIdentifier(callee)
        ? callee.text
        : ts.isPropertyAccessExpression(callee)
          ? `.${callee.name.text}`
          : "";
      if (["redirect", ".push", ".replace"].includes(name))
        sinks.push(node.arguments[0]);
    }
    for (const sink of sinks)
      facts.links.push(...resolve(sink).filter((p) => !isApi(p)));

    ts.forEachChild(node, visit);
  };
  visit(source);
  factsCache.set(file, facts);
  return facts;
}

function layoutsAbove(page: string): string[] {
  const layouts: string[] = [];
  for (let dir = dirname(page); dir.startsWith(APP); dir = dirname(dir)) {
    const layout = join(dir, "layout.tsx");
    if (existsSync(layout)) layouts.push(layout);
  }
  return layouts;
}

// A page that posts to an API route follows the `next` path that route returns, so the
// route's code is part of what the page can navigate to.
function reachableFrom(page: string): string[] {
  const seen = new Set<string>();
  const queue = [page, ...layoutsAbove(page)];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const facts = factsOf(file);
    queue.push(...facts.imports);
    for (const call of facts.apiCalls) {
      const route = API_ROUTES.find((r) =>
        matches(r.segments, linkSegments(call)),
      );
      if (route) queue.push(route.file);
    }
  }
  return [...seen];
}

const nav = readNavigation();

describe("docs/07 navigation summary", () => {
  it("reads routes and arrows from the doc", () => {
    expect(nav.routes.length).toBeGreaterThan(0);
    expect(nav.edges.length).toBeGreaterThan(0);
  });

  it.each(nav.routes)("route %s has a page", (route) => {
    expect(
      pageFor(route),
      `no page.tsx under src/app serves ${route}`,
    ).toBeDefined();
  });

  it.each(nav.edges)("edge $from → $to", ({ from, to }) => {
    const page = pageFor(from);
    expect(page, `no page.tsx under src/app serves ${from}`).toBeDefined();
    const links = reachableFrom(page!).flatMap((file) => factsOf(file).links);
    expect(
      links.some((link) => matches(segments(to), linkSegments(link))),
      `nothing reachable from ${relative(ROOT, page!)} links to ${to}`,
    ).toBe(true);
  });

  it("has no dead links in the app", () => {
    const files = ["app", "components", "server"]
      .flatMap((dir) => sourceFiles(join(SRC, dir), /\.tsx?$/))
      .filter((f) => !isTest(f));
    const dead = files.flatMap((file) =>
      factsOf(file)
        .links.filter(
          (link) => !PAGES.some((p) => matches(p.segments, linkSegments(link))),
        )
        .map(
          (link) => `${relative(ROOT, file)}: ${link.replaceAll(HOLE, "${…}")}`,
        ),
    );
    expect(dead, `links with no page:\n${dead.join("\n")}`).toEqual([]);
  });
});
