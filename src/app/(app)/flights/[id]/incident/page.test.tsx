import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import vectors from "../../../../../../reference/flight-engine/vectors.json";
import type { SyncPayload } from "@/components/sync";
import { SyncContext, type SyncState } from "@/components/SyncProvider";
import { ToastProvider } from "@/components/Toasts";
import type { FlightPlan } from "@/lib/flight/engine";
import { delayedFlight, DURING, syncBird } from "@/test/fixtures/delayedFlight";
import IncidentPage from "./page";

const nav = vi.hoisted(() => ({ id: "f1" }));
vi.mock("next/navigation", () => ({ useParams: () => ({ id: nav.id }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: ComponentProps<"a">) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

type FakeNode = EventTarget & {
  nodeType: number;
  tagName?: string;
  nodeValue?: string;
  textContent?: string;
  attrs: Record<string, string>;
  childNodes: FakeNode[];
  parentNode: FakeNode | null;
};

function fakeNode(nodeType: number, tagName?: string, nodeValue?: string) {
  const self: FakeNode = Object.assign(new EventTarget(), {
    nodeType,
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

const NOT_FOUND = "We could not find this flight.";
const UNREACHABLE = "We could not reach the loft. Try again.";
const SEARCH_LINE = "20 seeds. 7 in 10 strays are back within the hour.";

const CALM = vectors.vectors.find((v) => v.name === "calm-short")!
  .plan as FlightPlan;
const FLIGHT = delayedFlight({ id: nav.id });

type Reply = () => Response | Promise<Response>;

let flightReply: Reply;
let listReply: Reply;
let searchReply: Reply;
let requests: string[];
let container: FakeNode;
let root: Root;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status });

async function fakeFetch(url: RequestInfo | URL, init?: RequestInit) {
  const request = `${init?.method ?? "GET"} ${String(url)}`;
  requests.push(request);
  if (request === `GET /api/flights/${nav.id}`) return flightReply();
  if (request === "GET /api/flights") return listReply();
  if (request === `POST /api/flights/${nav.id}/search-party`)
    return searchReply();
  throw new Error(`unexpected ${request}`);
}

const screen = () => textOf(container);
const searchButton = () => find(container, (n) => n.tagName === "BUTTON");
const searchPosts = () => requests.filter((r) => r.startsWith("POST")).length;

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function mount() {
  container = fakeNode(1, "DIV");
  root = createRoot(container as unknown as Element);
  const sync = {
    data: {
      birds: [syncBird()],
      me: { units: "mi" },
    } as unknown as SyncPayload,
    error: null,
    offsetMs: DURING - Date.now(),
    refresh: () => {},
  } satisfies SyncState;
  await act(async () => {
    root.render(
      <SyncContext.Provider value={sync}>
        <ToastProvider>
          <IncidentPage />
        </ToastProvider>
      </SyncContext.Provider>,
    );
  });
  await settle();
}

async function click(target: FakeNode) {
  await act(async () => {
    const event = new Event("click", { bubbles: true });
    Object.defineProperty(event, "target", { value: target });
    container.dispatchEvent(event);
  });
  await settle();
}

beforeEach(() => {
  requests = [];
  flightReply = () => json(200, { flight: FLIGHT });
  listReply = () =>
    json(200, {
      yours: [FLIGHT, delayedFlight({ id: "f0" })],
      incoming: [delayedFlight({ id: "in1", role: "incoming" })],
      landedToday: [],
      earlier: [delayedFlight({ id: "old1" })],
      nextCursor: null,
    });
  searchReply = () =>
    json(200, { flight: delayedFlight({ id: nav.id, searchParty: "found" }) });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { HTMLIFrameElement: class {} }),
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

describe("/flights/[id]/incident", () => {
  it("shows the loader while the flight is on its way", async () => {
    flightReply = () => new Promise<Response>(() => {});
    await mount();
    expect(find(container, (n) => n.attrs["aria-busy"] === "true")).not.toBe(
      null,
    );
    expect(screen()).not.toContain("did not arrive");
  });

  it.each<[string, () => void, string]>([
    [
      "a flight the server does not know",
      () => {
        flightReply = () =>
          json(404, { error: { code: "not_found", message: "no flight" } });
      },
      NOT_FOUND,
    ],
    [
      "an unreachable loft",
      () => {
        flightReply = () => Promise.reject(new TypeError("offline"));
      },
      UNREACHABLE,
    ],
    [
      "a report number that cannot be counted",
      () => {
        listReply = () => Promise.reject(new TypeError("offline"));
      },
      UNREACHABLE,
    ],
  ])("says so for %s", async (_, arrange, message) => {
    arrange();
    await mount();
    expect(find(container, (n) => n.attrs.role === "alert")).not.toBe(null);
    expect(screen()).toContain(message);
    expect(screen()).not.toContain("did not arrive");
  });

  it("refuses the report to someone who does not own the bird", async () => {
    flightReply = () =>
      json(200, { flight: delayedFlight({ id: nav.id, role: "incoming" }) });
    await mount();
    expect(screen()).toContain(NOT_FOUND);
    expect(screen()).not.toContain("did not arrive");
  });

  it("has nothing to report for a flight that never wandered off, with a way back", async () => {
    flightReply = () =>
      json(200, { flight: delayedFlight({ id: nav.id, plan: CALM }) });
    await mount();
    expect(screen()).toContain("Kevin is not running late. Nothing to report.");
    expect(
      find(container, (n) => n.attrs.href === `/flights/${nav.id}`),
    ).not.toBe(null);
    expect(searchButton()).toBe(null);
  });

  it("files the report for my bird on a major delay", async () => {
    await mount();
    expect(screen()).toContain("Flight incident report no. 0003");
    expect(screen()).toContain("Kevin did not arrive");
    expect(screen()).toContain("Brooklyn to Philly, 82 miles");
    const button = searchButton()!;
    expect(textOf(button)).toBe(`Send a search party ${SEARCH_LINE}`);
    expect(button.attrs.disabled).toBeUndefined();
  });

  it("sends one search party and shows how it went in place", async () => {
    let land: () => void = () => {};
    const found = searchReply;
    searchReply = () =>
      new Promise<Response>((resolve) => {
        land = () => resolve(found());
      });
    await mount();
    await click(searchButton()!);
    await click(searchButton()!);
    expect(searchButton()!.attrs.disabled).toBeDefined();
    await act(async () => land());
    await settle();

    expect(searchPosts()).toBe(1);
    const button = searchButton()!;
    expect(button.attrs.disabled).toBeDefined();
    expect(textOf(button)).toBe(
      "Send a search party Found him. Back in the air.",
    );
    expect(screen()).toContain("Kevin did not arrive");
  });

  it("keeps the report and says why when the search party is refused", async () => {
    searchReply = () =>
      json(409, {
        error: { code: "conflict", message: "Kevin is already on the way." },
      });
    await mount();
    await click(searchButton()!);

    expect(searchPosts()).toBe(1);
    expect(
      textOf(find(container, (n) => n.attrs.role === "status")!),
    ).toContain("Kevin is already on the way.");
    const button = searchButton()!;
    expect(textOf(button)).toBe(`Send a search party ${SEARCH_LINE}`);
    expect(button.attrs.disabled).toBeUndefined();
  });
});
