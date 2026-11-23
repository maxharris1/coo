import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LAST_PAGE_KEY } from "@/components/lastPage";
import ReportBugPage from "./page";

const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/more/report-bug",
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

type FakeNode = EventTarget & {
  nodeType: number;
  nodeName?: string;
  tagName?: string;
  nodeValue?: string;
  textContent?: string;
  value?: string;
  attrs: Record<string, string>;
  childNodes: FakeNode[];
  parentNode: FakeNode | null;
};

function fakeNode(nodeType: number, tagName?: string, nodeValue?: string) {
  const self: FakeNode = Object.assign(new EventTarget(), {
    nodeType,
    nodeName: tagName,
    tagName,
    nodeValue,
    ownerDocument: document,
    style: { setProperty() {}, removeProperty() {} },
    attrs: {},
    childNodes: [],
    parentNode: null,
    setAttribute: (name: string, value: unknown) =>
      void (self.attrs[name] = String(value)),
    removeAttribute: (name: string) => void delete self.attrs[name],
    attachEvent() {},
    detachEvent() {},
    appendChild(child: FakeNode) {
      child.parentNode = self;
      self.childNodes.push(child);
      return child;
    },
    insertBefore(child: FakeNode, before: FakeNode) {
      child.parentNode = self;
      self.childNodes.splice(self.childNodes.indexOf(before), 0, child);
      return child;
    },
    removeChild(child: FakeNode) {
      self.childNodes.splice(self.childNodes.indexOf(child), 1);
      return child;
    },
  });
  return Object.defineProperties(self, {
    firstChild: { get: () => self.childNodes[0] ?? null },
    lastChild: { get: () => self.childNodes.at(-1) ?? null },
  });
}

const textOf = (n: FakeNode): string =>
  (n.nodeType === 3
    ? (n.nodeValue ?? "")
    : [n.textContent ?? "", ...n.childNodes.map(textOf)].join(" ")
  )
    .replace(/\s+/g, " ")
    .trim();

function find(n: FakeNode, hit: (n: FakeNode) => boolean): FakeNode | null {
  if (hit(n)) return n;
  for (const child of n.childNodes) {
    const found = find(child, hit);
    if (found) return found;
  }
  return null;
}

type Posted = { clientKey: string; body: string; context: { route: string } };

let reply: () => Response | Promise<Response>;
let posts: { url: string; method: string; body: Posted }[];
let store: Map<string, string>;
let container: FakeNode;
let root: Root;

async function fakeFetch(url: RequestInfo | URL, init?: RequestInit) {
  posts.push({
    url: String(url),
    method: init?.method ?? "GET",
    body: JSON.parse(String(init?.body)) as Posted,
  });
  return reply();
}

const screen = () => textOf(container);
const textarea = () => find(container, (n) => n.tagName === "TEXTAREA");
const sendButton = () => find(container, (n) => n.tagName === "BUTTON");
const links = () => {
  const found: FakeNode[] = [];
  find(container, (n) => {
    if (n.tagName === "A") found.push(n);
    return false;
  });
  return found;
};

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function mount() {
  container = fakeNode(1, "DIV");
  root = createRoot(container as unknown as Element);
  await act(async () => root.render(<ReportBugPage />));
  await settle();
}

async function dispatch(type: string, target: FakeNode) {
  await act(async () => {
    const event = new Event(type, { bubbles: true });
    Object.defineProperty(event, "target", { value: target });
    container.dispatchEvent(event);
  });
  await settle();
}

async function type(text: string) {
  const field = textarea()!;
  await dispatch("focusin", field);
  field.value = text;
  await dispatch("keyup", field);
}

beforeEach(() => {
  posts = [];
  store = new Map();
  reply = () => new Response(JSON.stringify({ id: "r1" }), { status: 201 });
  Object.values(router).forEach((spy) => spy.mockClear());
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), {
      HTMLIFrameElement: class {},
      innerWidth: 390,
      innerHeight: 844,
      matchMedia: () => ({ matches: false }),
      navigator: {},
      sessionStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
      },
    }),
  );
  vi.stubGlobal(
    "document",
    Object.assign(new EventTarget(), {
      createElement: (tag: string) => fakeNode(1, tag.toUpperCase()),
      createElementNS: (_ns: string, tag: string) => fakeNode(1, tag),
      createTextNode: (text: string) => fakeNode(3, undefined, text),
    }),
  );
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

describe("/more/report-bug", () => {
  it("replaces the form with the confirmation in place, and only the back link leaves", async () => {
    await mount();
    await type("The bird stayed home.");
    await dispatch("click", sendButton()!);

    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe("/api/bug-reports");
    expect(posts[0].method).toBe("POST");
    expect(posts[0].body.body).toBe("The bird stayed home.");
    expect(screen()).toContain("Report sent.");
    expect(screen()).toContain("A pigeon has it. Thank you for the details.");
    expect(textarea()).toBe(null);
    expect(sendButton()).toBe(null);
    const back = links().filter((a) => a.attrs.href === "/more");
    expect(back.map(textOf)).toContain("Back to the post office");
    expect(links().every((a) => a.attrs.href === "/more")).toBe(true);
    Object.values(router).forEach((spy) => expect(spy).not.toHaveBeenCalled());
  });

  it("shows the page the person came from and posts it as the route", async () => {
    store.set(LAST_PAGE_KEY, "/flights");
    await mount();
    expect(screen()).toContain(
      "We'll include: the page you came from (/flights),",
    );

    await type("Map froze.");
    await dispatch("click", sendButton()!);
    expect(posts[0].body.context.route).toBe("/flights");
  });

  it("falls back to /more when no page was remembered", async () => {
    await mount();
    expect(screen()).toContain(
      "We'll include: the page you came from (/more),",
    );

    await type("Map froze.");
    await dispatch("click", sendButton()!);
    expect(posts[0].body.context.route).toBe("/more");
  });

  it("keeps the text and says why when the report is refused", async () => {
    reply = () =>
      new Response(
        JSON.stringify({ error: { code: "rate_limited", message: "slow" } }),
        { status: 429 },
      );
    await mount();
    await type("Map froze.");
    await dispatch("click", sendButton()!);

    expect(textOf(find(container, (n) => n.attrs.role === "alert")!)).toBe(
      "That is a lot of reports. Try again in an hour.",
    );
    expect(textarea()!.value).toBe("Map froze.");
    expect(screen()).not.toContain("Report sent.");
  });
});
