import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncContext, type SyncState } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import type { FriendRow } from "@/server/services/friends";
import type { ShoeboxNote } from "@/server/services/notes";
import type { ShoeboxViewProps } from "./ShoeboxView";
import ShoeboxPage from "./page";

const css = readFileSync(
  new URL("./Shoebox.module.css", import.meta.url),
  "utf8",
);

const rule = (selector: string) =>
  css.match(new RegExp(`\\.${selector}\\s*{([^}]*)}`))?.[1] ?? "";

const view = vi.hoisted(() => ({
  props: null as ShoeboxViewProps | null,
  toasts: [] as string[],
  toast: (message: string) => void view.toasts.push(message),
}));

const nav = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = {
    params: new URLSearchParams(),
    replace: vi.fn<(href: string, opts: { scroll: boolean }) => void>(
      (href) => {
        state.params = new URL(href, "https://coo.test").searchParams;
        listeners.forEach((l) => l());
      },
    ),
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
  return state;
});

vi.mock("next/navigation", async () => {
  const { useSyncExternalStore } = await import("react");
  return {
    useRouter: () => ({ replace: nav.replace }),
    useSearchParams: () =>
      useSyncExternalStore(
        nav.subscribe,
        () => nav.params,
        () => nav.params,
      ),
  };
});

vi.mock("./ShoeboxView", () => ({
  ShoeboxView: (props: ShoeboxViewProps) => {
    view.props = props;
    return null;
  },
}));

vi.mock("@/components/Toasts", () => ({
  useToast: () => view.toast,
}));

const { ShoeboxView } =
  await vi.importActual<typeof import("./ShoeboxView")>("./ShoeboxView");

const note = (id: string, name = "Priya"): ShoeboxNote => ({
  id,
  direction: "received",
  state: "delivered",
  body: `Body of ${id}`,
  with: { id: name.toLowerCase(), name, handle: null },
  bird: null,
  trip: null,
  createdAt: Date.parse("2026-11-19T15:00:00Z"),
  deliveredAt: Date.parse("2026-11-19T16:00:00Z"),
});

const friendId = (id: string) => id as FriendRow["id"];

const FRIENDS = [
  { id: "priya", name: "Priya" },
  { id: "theo", name: "Theo" },
] as FriendRow[];

type Call = { url: URL; done: boolean; resolve: (res: Response) => void };
let calls: Call[];
let root: Root | null;

function fakeFetch(input: RequestInfo | URL) {
  const url = new URL(String(input), "https://coo.test");
  return new Promise<Response>((resolve) => {
    calls.push({ url, done: false, resolve });
  });
}

const requests = (path: string) =>
  calls.filter((c) => c.url.pathname === path).map((c) => c.url);

async function answer(
  path: string,
  body: unknown,
  { status = 200, nth = 0 } = {},
) {
  const call = calls.filter((c) => c.url.pathname === path && !c.done)[nth];
  if (!call) throw new Error(`no open request to ${path}`);
  call.done = true;
  await act(async () => call.resolve(Response.json(body, { status })));
}

const page = (notes: ShoeboxNote[], nextCursor: string | null = null) => ({
  notes,
  nextCursor,
  total: notes.length,
});

async function mount() {
  const container = Object.assign(new EventTarget(), {
    nodeType: 1,
    tagName: "DIV",
    ownerDocument: new EventTarget(),
  }) as unknown as Element;
  const r = createRoot(container);
  root = r;
  const sync = {
    data: { me: { timezone: "America/New_York" } } as unknown as SyncPayload,
    error: null,
    offsetMs: 0,
    refresh: () => {},
  } satisfies SyncState;
  await act(async () => {
    r.render(
      <SyncContext.Provider value={sync}>
        <ShoeboxPage />
      </SyncContext.Provider>,
    );
  });
}

const props = () => {
  if (!view.props) throw new Error("ShoeboxView not rendered");
  return view.props;
};

const shown = () => renderToStaticMarkup(<ShoeboxView {...props()} />);

const ids = () => {
  const list = props().list;
  return list.kind === "ready" ? list.notes.map((n) => n.id) : null;
};

beforeEach(() => {
  calls = [];
  view.props = null;
  view.toasts.length = 0;
  nav.params = new URLSearchParams();
  nav.replace.mockClear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { HTMLIFrameElement: class {} }),
  );
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
});

afterEach(async () => {
  const r = root;
  root = null;
  if (r) await act(async () => r.unmount());
  vi.unstubAllGlobals();
});

describe("/shoebox loading", () => {
  it("asks for page one of notes and the friends, showing the loader meanwhile", async () => {
    await mount();
    const [notes] = requests("/api/notes");
    expect(notes.searchParams.has("friendId")).toBe(false);
    expect(notes.searchParams.has("cursor")).toBe(false);
    expect(requests("/api/friends")).toHaveLength(1);
    expect(props().list).toEqual({ kind: "loading" });
    expect(shown()).toContain('aria-busy="true"');
  });
});

describe("/shoebox ready", () => {
  it("renders the header and one card per note in the API's order", async () => {
    await mount();
    await answer("/api/friends", { friends: FRIENDS, guestLinks: [] });
    await answer("/api/notes", page([note("n3"), note("n2"), note("n1")]));
    expect(ids()).toEqual(["n3", "n2", "n1"]);
    expect(props().timeZone).toBe("America/New_York");
    const html = shown();
    expect(html).toMatch(/<h1[^>]*>Shoebox<\/h1>/);
    expect(html).toContain("3 notes");
    expect(html).toContain(">Theo</button>");
    const order = ["n3", "n2", "n1"].map((id) => html.indexOf(`Body of ${id}`));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).not.toContain("More notes");
  });

  it("shows the empty line when there are no notes", async () => {
    await mount();
    await answer("/api/notes", page([]));
    const html = shown();
    expect(html).toContain("No notes yet. Send one and it lives here.");
    expect(html).not.toContain("<article");
  });
});

describe("/shoebox friend filter", () => {
  it("preselects the chip named by ?friend=", async () => {
    nav.params = new URLSearchParams("friend=theo");
    await mount();
    expect(requests("/api/notes")[0].searchParams.get("friendId")).toBe("theo");
    await answer("/api/friends", { friends: FRIENDS, guestLinks: [] });
    await answer("/api/notes", page([note("t1", "Theo")]));
    expect(props().selected).toBe("theo");
    expect(shown()).toMatch(/aria-pressed="true"[^>]*>Theo</);
  });

  it("a chip writes ?friend= and refetches page one for that friend", async () => {
    await mount();
    await answer("/api/notes", page([note("n1")]));
    await act(async () => props().onSelect(friendId("priya")));
    expect(nav.replace).toHaveBeenLastCalledWith("/shoebox?friend=priya", {
      scroll: false,
    });
    expect(props().selected).toBe("priya");
    const latest = requests("/api/notes").at(-1)!;
    expect(latest.searchParams.get("friendId")).toBe("priya");
    expect(latest.searchParams.has("cursor")).toBe(false);
    await answer("/api/notes", page([note("p1")]));
    expect(ids()).toEqual(["p1"]);

    await act(async () => props().onSelect(null));
    expect(nav.replace).toHaveBeenLastCalledWith("/shoebox", {
      scroll: false,
    });
    expect(requests("/api/notes").at(-1)!.searchParams.has("friendId")).toBe(
      false,
    );
  });

  it("ignores a slower answer for an earlier filter", async () => {
    await mount();
    await answer("/api/notes", page([note("n1")]));
    await act(async () => props().onSelect(friendId("priya")));
    await act(async () => props().onSelect(friendId("theo")));
    await answer("/api/notes", page([note("t1", "Theo")]), { nth: 1 });
    await answer("/api/notes", page([note("p1")]));
    expect(ids()).toEqual(["t1"]);
  });
});

describe("/shoebox paging", () => {
  it("More notes appends the next page by cursor for the same friend", async () => {
    nav.params = new URLSearchParams("friend=priya");
    await mount();
    await answer("/api/notes", page([note("p3"), note("p2")], "c1"));
    expect(shown()).toContain("More notes");
    await act(async () => props().onMore());
    const more = requests("/api/notes").at(-1)!;
    expect(more.searchParams.get("cursor")).toBe("c1");
    expect(more.searchParams.get("friendId")).toBe("priya");
    await answer("/api/notes", page([note("p1")]));
    expect(ids()).toEqual(["p3", "p2", "p1"]);
    expect(shown()).not.toContain("More notes");
  });

  it("pages only the selected friend's own first page after a filter change", async () => {
    await mount();
    const priya = Array.from({ length: 30 }, (_, i) => note(`p${30 - i}`));
    await answer("/api/notes", page(priya, "c-priya"));
    await act(async () => props().onSelect(friendId("rosa")));
    expect(shown()).not.toContain("More notes");
    await act(async () => props().onMore());
    const rosa = [note("r2", "Rosa"), note("r1", "Rosa")];
    await answer("/api/notes", page(rosa));
    while (calls.some((c) => c.url.pathname === "/api/notes" && !c.done)) {
      await answer("/api/notes", page(rosa));
    }
    expect(ids()).toEqual(["r2", "r1"]);
    for (const url of requests("/api/notes")) {
      if (url.searchParams.get("cursor") === "c-priya") {
        expect(url.searchParams.has("friendId")).toBe(false);
      }
    }
  });

  it("drops a page started under the previous filter", async () => {
    await mount();
    await answer("/api/notes", page([note("p2"), note("p1")], "c1"));
    await act(async () => props().onMore());
    await act(async () => props().onSelect(friendId("rosa")));
    await answer("/api/notes", page([note("r1", "Rosa")]), { nth: 1 });
    await answer("/api/notes", page([note("p0")]));
    expect(ids()).toEqual(["r1"]);
  });

  it("shows the loader, not the old filter's cards, until the new first page lands", async () => {
    nav.params = new URLSearchParams("friend=rosa");
    await mount();
    await answer("/api/notes", page([note("r1", "Rosa")], "c-rosa"));
    await act(async () => props().onSelect(null));
    expect(props().list).toEqual({ kind: "loading" });
    await answer("/api/notes", page([note("p1")], "c-all"));
    await act(async () => props().onSelect(friendId("rosa")));
    expect(props().list).toEqual({ kind: "loading" });
  });

  it("a failed page keeps the cards and toasts the API's message", async () => {
    await mount();
    await answer("/api/notes", page([note("n2")], "c1"));
    await act(async () => props().onMore());
    await answer(
      "/api/notes",
      { error: { message: "The shoebox lid is stuck." } },
      { status: 500 },
    );
    expect(view.toasts).toEqual(["The shoebox lid is stuck."]);
    expect(ids()).toEqual(["n2"]);
    expect(shown()).toContain("More notes");
  });
});

describe("/shoebox errors", () => {
  it("toasts the API's message when the notes fail", async () => {
    await mount();
    await answer(
      "/api/notes",
      { error: { message: "Sign in to see your shoebox." } },
      { status: 401 },
    );
    expect(view.toasts).toEqual(["Sign in to see your shoebox."]);
    expect(props().list).toEqual({ kind: "failed" });
  });

  it("toasts the API's message when the friends fail", async () => {
    await mount();
    await answer(
      "/api/friends",
      { error: { message: "Friends are napping." } },
      { status: 503 },
    );
    expect(view.toasts).toEqual(["Friends are napping."]);
  });
});

describe("/shoebox layout", () => {
  it("frames the page like the mock", () => {
    const screen = rule("screen");
    expect(screen).toMatch(/flex-direction:\s*column/);
    expect(screen).toMatch(/padding:\s*var\(--coo-gutter\)/);
    expect(screen).toMatch(/gap:\s*12px/);
    expect(screen).toMatch(/background:\s*var\(--coo-paper\)/);
  });

  it("stacks the cards 16px apart", () => {
    const list = rule("list");
    expect(list).toMatch(/flex-direction:\s*column/);
    expect(list).toMatch(/gap:\s*16px/);
    expect(list).toMatch(/padding-top:\s*4px/);
  });

  it("gives More notes a full tap target", () => {
    expect(rule("more")).toMatch(/min-height:\s*var\(--coo-touch\)/);
  });
});
