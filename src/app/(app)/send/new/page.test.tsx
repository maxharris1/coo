import { act, StrictMode, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastContext } from "@/components/Toasts";
import { snap } from "@/lib/game/privacy";
import type { PlaceResult } from "../../welcome/loft/roost";
import { PREFILL_NAME_KEY } from "../recipients";
import { pinKey } from "../write/guest";
import { nextHref } from "./newRecipient";
import type { NewRecipientView } from "./NewRecipientView";
import NewRecipientPage from "./page";

type ViewProps = ComponentProps<typeof NewRecipientView>;

const seen = vi.hoisted(() => ({ view: null as ViewProps | null }));

vi.mock("./NewRecipientView", () => ({
  NewRecipientView: (props: ViewProps) => {
    seen.view = props;
    return null;
  },
}));

const FISHTOWN: PlaceResult = {
  placeId: "p1",
  label: "Fishtown, Philadelphia",
  sublabel: "Philadelphia, PA",
  kind: "neighbourhood",
};
const PHILLY: PlaceResult = {
  placeId: "p2",
  label: "Philadelphia, PA",
  sublabel: "Pennsylvania",
  kind: "city",
};

const START = snap(39.9726, -75.1349);
const PHILLY_START = snap(39.9526, -75.1652);

let stored: Map<string, string>;
let answer: (q: string) => Promise<Response>;
let place: (placeId: string) => Promise<Response>;
let fetchMock: ReturnType<
  typeof vi.fn<(url: RequestInfo | URL) => Promise<Response>>
>;
let toast: ReturnType<typeof vi.fn<(message: string) => void>>;
let root: Root | null;

const view = () => seen.view!;

async function show() {
  const container = Object.assign(new EventTarget(), {
    nodeType: 1,
    tagName: "DIV",
    ownerDocument: new EventTarget(),
  }) as unknown as Element;
  const r = createRoot(container);
  root = r;
  await act(async () =>
    r.render(
      <StrictMode>
        <ToastContext.Provider value={toast}>
          <NewRecipientPage />
        </ToastContext.Provider>
      </StrictMode>,
    ),
  );
}

const unmount = async () => {
  const r = root;
  root = null;
  await act(async () => r?.unmount());
};

const tick = (ms: number) =>
  act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

const type = (q: string) => act(async () => view().onQuery(q));

const requested = (path: string) =>
  fetchMock.mock.calls
    .map(([url]) => new URL(String(url), "http://x"))
    .filter((u) => u.pathname === path);

const searched = () =>
  requested("/api/geo/search").map((u) => u.searchParams.get("q"));

const pick = async (result: PlaceResult) => {
  await type(result.label.slice(0, 4));
  await tick(300);
  await act(async () => view().onPick(result));
};

beforeEach(() => {
  vi.useFakeTimers();
  seen.view = null;
  root = null;
  stored = new Map();
  toast = vi.fn<(message: string) => void>();
  answer = () =>
    Promise.resolve(Response.json({ results: [FISHTOWN, PHILLY] }));
  place = (placeId) =>
    Promise.resolve(
      Response.json({ start: placeId === "p1" ? START : PHILLY_START }),
    );
  fetchMock = vi.fn((url: RequestInfo | URL) => {
    const u = new URL(String(url), "http://x");
    return u.pathname === "/api/geo/place"
      ? place(u.searchParams.get("placeId") ?? "")
      : answer(u.searchParams.get("q") ?? "");
  });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { HTMLIFrameElement: class {} }),
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => void stored.set(k, v),
    removeItem: (k: string) => void stored.delete(k),
  });
});

afterEach(async () => {
  await unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("NewRecipient page prefill (ac-4)", () => {
  it("prefills the name handed off from the contact picker, then forgets it", async () => {
    stored.set(PREFILL_NAME_KEY, "Maya Okafor");
    await show();
    expect(view().name).toBe("Maya Okafor");
    expect(stored.has(PREFILL_NAME_KEY)).toBe(false);

    await unmount();
    await show();
    expect(view().name).toBe("");
  });

  it("leaves the handed-off name for the browser when rendered on the server", () => {
    stored.set(PREFILL_NAME_KEY, "Maya Okafor");
    const html = renderToStaticMarkup(
      <ToastContext.Provider value={toast}>
        <NewRecipientPage />
      </ToastContext.Provider>,
    );
    expect(html).toContain('aria-busy="true"');
    expect(seen.view).toBeNull();
    expect(stored.get(PREFILL_NAME_KEY)).toBe("Maya Okafor");
  });

  it("starts with an empty name and lets the sender type one", async () => {
    await show();
    expect(view().name).toBe("");
    await act(async () => view().onName("Maya"));
    expect(view().name).toBe("Maya");
  });
});

describe("NewRecipient page search", () => {
  it("searches once the typing settles and shows the places", async () => {
    await show();
    await type("F");
    await type("Fi");
    await type("Fish");
    expect(view().search).toEqual({ kind: "loading", query: "Fish" });
    await tick(299);
    expect(searched()).toEqual([]);
    await tick(1);
    expect(searched()).toEqual(["Fish"]);
    expect(view().search).toEqual({
      kind: "results",
      query: "Fish",
      results: [FISHTOWN, PHILLY],
    });
  });

  it("picking a place fills the field and readies Next without searching again", async () => {
    await show();
    await act(async () => view().onName("Maya"));
    await type("Fish");
    await tick(300);
    await act(async () => view().onPick(FISHTOWN));
    expect(view().picked).toMatchObject({
      placeId: "p1",
      label: "Fishtown, Philadelphia",
    });
    expect(view().query).toBe("Fishtown, Philadelphia");
    expect(view().search).toMatchObject({
      kind: "results",
      results: [FISHTOWN, PHILLY],
    });
    await tick(1000);
    expect(searched()).toEqual(["Fish"]);
  });

  it("drops the pick once the sender edits the place", async () => {
    await show();
    await type("Fish");
    await tick(300);
    await act(async () => view().onPick(FISHTOWN));
    await type("Fishtown, Phila");
    expect(view().picked).toBeNull();
  });

  it("ignores an answer that arrives after the query moved on", async () => {
    const late: Record<string, (r: Response) => void> = {};
    answer = (q) => new Promise((resolve) => (late[q] = resolve));
    await show();
    await type("Fish");
    await tick(300);
    await type("Phil");
    await tick(300);
    await act(async () => late.Phil(Response.json({ results: [PHILLY] })));
    await act(async () => late.Fish(Response.json({ results: [FISHTOWN] })));
    expect(view().search).toEqual({
      kind: "results",
      query: "Phil",
      results: [PHILLY],
    });
  });

  it("toasts the reason and shows the failed state when the search fails", async () => {
    answer = () =>
      Promise.resolve(
        Response.json(
          {
            error: { message: "That is a lot of pigeons. Try again in a bit." },
          },
          { status: 429 },
        ),
      );
    await show();
    await type("Fish");
    await tick(300);
    expect(toast).toHaveBeenCalledExactlyOnceWith(
      "That is a lot of pigeons. Try again in a bit.",
    );
    expect(view().search).toEqual({ kind: "failed", query: "Fish" });
  });

  it("goes back to idle when the field is cleared", async () => {
    await show();
    await type("Fish");
    await type("");
    await tick(1000);
    expect(view().search).toEqual({ kind: "idle" });
    expect(searched()).toEqual([]);
  });
});

describe("NewRecipient page pin", () => {
  it("drops the pin at the place's snapped start and hands nothing on yet", async () => {
    stored.set(pinKey("p1"), JSON.stringify(snap(40, -75)));
    await show();
    await pick(FISHTOWN);
    expect(
      requested("/api/geo/place").map((u) => u.searchParams.get("placeId")),
    ).toEqual(["p1"]);
    expect(view().picked).toEqual({
      placeId: "p1",
      label: "Fishtown, Philadelphia",
      spot: { start: START, pin: START },
    });
    expect(stored.has(pinKey("p1"))).toBe(false);
  });

  it("readies Next before the starting point arrives", async () => {
    place = () => new Promise(() => {});
    await show();
    await act(async () => view().onName("Maya"));
    await pick(FISHTOWN);
    expect(view().picked).toEqual({
      placeId: "p1",
      label: "Fishtown, Philadelphia",
      spot: null,
    });
  });

  it("hands a moved pin to Compose through the session, never the link", async () => {
    await show();
    await act(async () => view().onName("Maya"));
    await pick(FISHTOWN);
    const raw = { lat: 39.97513, lon: -75.13121 };
    await act(async () => view().onPin(raw));
    expect(JSON.parse(stored.get(pinKey("p1"))!)).toEqual(
      snap(raw.lat, raw.lon),
    );
    expect(view().picked?.spot).toEqual({
      start: START,
      pin: snap(raw.lat, raw.lon),
    });
    const href = new URL(
      nextHref({ name: view().name, placeId: view().picked!.placeId }),
      "http://x",
    );
    expect([...href.searchParams.keys()]).toEqual(["guest", "place"]);
  });

  it("forgets the handed-off pin once it is moved back to the start", async () => {
    await show();
    await pick(FISHTOWN);
    await act(async () => view().onPin({ lat: 39.9751, lon: -75.1312 }));
    await act(async () => view().onPin(START));
    expect(stored.has(pinKey("p1"))).toBe(false);
    expect(view().picked?.spot).toEqual({ start: START, pin: START });
  });

  it("ignores a starting point that lands after the pick was dropped", async () => {
    const late: Record<string, (r: Response) => void> = {};
    place = (id) => new Promise((resolve) => (late[id] = resolve));
    await show();
    await pick(FISHTOWN);
    await type("Fishtown, Phila");
    await act(async () => late.p1(Response.json({ start: START })));
    expect(view().picked).toBeNull();
  });

  it("ignores a starting point that lands after another place was picked", async () => {
    const late: Record<string, (r: Response) => void> = {};
    place = (id) => new Promise((resolve) => (late[id] = resolve));
    await show();
    await pick(FISHTOWN);
    await act(async () => view().onPick(PHILLY));
    await act(async () => late.p2(Response.json({ start: PHILLY_START })));
    await act(async () => late.p1(Response.json({ start: START })));
    expect(view().picked).toEqual({
      placeId: "p2",
      label: "Philadelphia, PA",
      spot: { start: PHILLY_START, pin: PHILLY_START },
    });
  });

  it("keeps the moved pin when an older lookup for the same place lands late", async () => {
    const late: ((r: Response) => void)[] = [];
    place = () => new Promise((resolve) => late.push(resolve));
    await show();
    await pick(FISHTOWN);
    await act(async () => view().onPick(PHILLY));
    await act(async () => view().onPick(FISHTOWN));
    const [firstFishtown, , lastFishtown] = late;
    await act(async () => lastFishtown(Response.json({ start: START })));
    const moved = snap(39.976, -75.13);
    await act(async () => view().onPin(moved));
    await act(async () => firstFishtown(Response.json({ start: START })));
    expect(view().picked?.spot).toEqual({ start: START, pin: moved });
    expect(JSON.parse(stored.get(pinKey("p1"))!)).toEqual(moved);
  });

  it("keeps the moved pin when picking the same place twice and the first lookup lands last", async () => {
    const late: ((r: Response) => void)[] = [];
    place = () => new Promise((resolve) => late.push(resolve));
    await show();
    await pick(FISHTOWN);
    await act(async () => view().onPick(FISHTOWN));
    const [first, second] = late;
    await act(async () => second(Response.json({ start: START })));
    const moved = snap(39.976, -75.13);
    await act(async () => view().onPin(moved));
    await act(async () => first(Response.json({ start: START })));
    expect(view().picked?.spot).toEqual({ start: START, pin: moved });
  });

  it("stays quiet when a lookup that was superseded fails", async () => {
    const late: ((r: Response) => void)[] = [];
    place = () => new Promise((resolve) => late.push(resolve));
    await show();
    await pick(FISHTOWN);
    await act(async () => view().onPick(PHILLY));
    await act(async () => late[1](Response.json({ start: PHILLY_START })));
    await act(async () =>
      late[0](Response.json({ error: { message: "slow" } }, { status: 503 })),
    );
    expect(toast).not.toHaveBeenCalled();
    expect(view().picked?.spot).toEqual({
      start: PHILLY_START,
      pin: PHILLY_START,
    });
  });

  it("toasts the reason and keeps the pick when the starting point fails", async () => {
    const message =
      "The map is slow to answer right now. Try again in a moment.";
    place = () =>
      Promise.resolve(Response.json({ error: { message } }, { status: 503 }));
    await show();
    await pick(FISHTOWN);
    expect(toast).toHaveBeenCalledExactlyOnceWith(message);
    expect(view().picked).toEqual({
      placeId: "p1",
      label: "Fishtown, Philadelphia",
      spot: null,
    });
  });
});
