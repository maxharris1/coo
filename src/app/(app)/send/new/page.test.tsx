import { act, StrictMode, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastContext } from "@/components/Toasts";
import { snap } from "@/lib/game/privacy";
import type { PlaceResult } from "../../welcome/loft/roost";
import { PREFILL_NAME_KEY } from "../recipients";
import { pinKey } from "../write/guest";
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

let stored: Map<string, string>;
let answer: (q: string) => Promise<Response>;
let placeAnswer: (placeId: string) => Promise<Response>;
let hereAnswer: (lat: string, lon: string) => Promise<Response>;
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

const calledAt = (path: string) =>
  fetchMock.mock.calls
    .map(([url]) => new URL(String(url), "http://x"))
    .filter((u) => u.pathname === path)
    .map((u) => u.searchParams);

const searched = () =>
  calledAt("/api/geo/search").map((params) => params.get("q"));

const START = { lat: 39.9705, lon: -75.1345 };
const DOOR = { lat: 39.971234567, lon: -75.133987654 };
const BACK = { lat: 40.12345678, lon: -74.87654321 };

const named = (label: string) =>
  Response.json({ place: { label, city: "Philadelphia, PA" } });

beforeEach(() => {
  vi.useFakeTimers();
  seen.view = null;
  root = null;
  stored = new Map();
  toast = vi.fn<(message: string) => void>();
  answer = () =>
    Promise.resolve(Response.json({ results: [FISHTOWN, PHILLY] }));
  placeAnswer = () => Promise.resolve(Response.json({ start: START }));
  hereAnswer = () =>
    Promise.resolve(
      Response.json({
        place: { label: "Kensington", city: "Philadelphia, PA" },
      }),
    );
  fetchMock = vi.fn((url: RequestInfo | URL) => {
    const u = new URL(String(url), "http://x");
    const param = (k: string) => u.searchParams.get(k) ?? "";
    if (u.pathname === "/api/geo/place") return placeAnswer(param("placeId"));
    if (u.pathname === "/api/geo/here")
      return hereAnswer(param("lat"), param("lon"));
    return answer(param("q"));
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
    expect(view().pickedId).toBe("p1");
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
    expect(view().pickedId).toBeNull();
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

describe("NewRecipient page destination pin", () => {
  async function picked(place: PlaceResult = FISHTOWN) {
    await show();
    await type("Fish");
    await tick(300);
    await act(async () => view().onPick(place));
  }

  it("shows no pin before a pick", async () => {
    await show();
    expect(view().destination).toBeNull();
  });

  it("starts the pin at the held place's starting point and stores nothing until it moves (ac-1, ac-2)", async () => {
    await picked();
    expect(calledAt("/api/geo/place").map((p) => p.get("placeId"))).toEqual([
      "p1",
    ]);
    expect(view().destination).toEqual({
      at: START,
      label: "Fishtown, Philadelphia",
    });
    expect(stored.has(pinKey("p1"))).toBe(false);
  });

  it("moves the pin to the exact point, labels it from the snapped pin, and stores it for compose (ac-2)", async () => {
    await picked();
    await act(async () => view().onMove(DOOR));
    const asked = calledAt("/api/geo/here");
    expect(asked).toHaveLength(1);
    const grid = snap(DOOR.lat, DOOR.lon);
    expect(Number(asked[0].get("lat"))).toBe(grid.lat);
    expect(Number(asked[0].get("lon"))).toBe(grid.lon);
    expect(view().destination).toEqual({ at: DOOR, label: "Kensington" });
    expect(JSON.parse(stored.get(pinKey("p1"))!)).toEqual(DOOR);
  });

  it("keeps the pin where it was and stores nothing when the spot has no name", async () => {
    hereAnswer = () =>
      Promise.resolve(
        Response.json({ place: null, message: "Could not find that place." }),
      );
    await picked();
    await act(async () => view().onMove(DOOR));
    expect(toast).toHaveBeenCalledExactlyOnceWith("Could not find that place.");
    expect(view().destination).toEqual({
      at: START,
      label: "Fishtown, Philadelphia",
    });
    expect(stored.has(pinKey("p1"))).toBe(false);
  });

  it("forgets a moved pin when the same place is picked again", async () => {
    await picked();
    await act(async () => view().onMove(DOOR));
    await act(async () => view().onPick(FISHTOWN));
    expect(view().destination).toEqual({
      at: START,
      label: "Fishtown, Philadelphia",
    });
    expect(stored.has(pinKey("p1"))).toBe(false);
  });

  it("toasts and shows no pin when the starting point cannot be read", async () => {
    placeAnswer = () =>
      Promise.resolve(
        Response.json(
          { error: { message: "placeId: unknown place" } },
          { status: 400 },
        ),
      );
    await picked();
    expect(toast).toHaveBeenCalledExactlyOnceWith("placeId: unknown place");
    expect(view().destination).toBeNull();
  });

  it("ignores a starting point that arrives after another pick", async () => {
    const late: Record<string, (r: Response) => void> = {};
    placeAnswer = (placeId) =>
      new Promise((resolve) => (late[placeId] = resolve));
    await picked(FISHTOWN);
    await act(async () => view().onPick(PHILLY));
    await act(async () => late.p2(Response.json({ start: START })));
    await act(async () =>
      late.p1(Response.json({ start: { lat: 1, lon: 1 } })),
    );
    expect(view().destination).toEqual({
      at: START,
      label: "Philadelphia, PA",
    });
  });

  it("drops the pin once the sender edits the place", async () => {
    await picked();
    await type("Fishtown, Phila");
    expect(view().destination).toBeNull();
  });

  function heldAnswers() {
    const late: ((r: Response) => void)[] = [];
    hereAnswer = () => new Promise((resolve) => late.push(resolve));
    return late;
  }

  it("keeps the most recent moved pin when lookup responses arrive out of order", async () => {
    const late = heldAnswers();
    await picked();
    await act(async () => view().onMove(DOOR));
    await act(async () => view().onMove(BACK));
    await act(async () => late[1](named("Latest")));
    await act(async () => late[0](named("Earlier")));
    expect(view().destination).toEqual({ at: BACK, label: "Latest" });
    expect(JSON.parse(stored.get(pinKey("p1"))!)).toEqual(BACK);
  });

  it("ignores an earlier move's answer that lands before the latest one", async () => {
    const late = heldAnswers();
    await picked();
    await act(async () => view().onMove(DOOR));
    await act(async () => view().onMove(BACK));
    await act(async () => late[0](named("Earlier")));
    expect(view().destination).toEqual({
      at: START,
      label: "Fishtown, Philadelphia",
    });
    expect(stored.has(pinKey("p1"))).toBe(false);
    await act(async () => late[1](named("Latest")));
    expect(view().destination).toEqual({ at: BACK, label: "Latest" });
    expect(JSON.parse(stored.get(pinKey("p1"))!)).toEqual(BACK);
  });

  it("holds Next while the latest move is being looked up", async () => {
    const late = heldAnswers();
    await picked();
    expect(view().settling).toBe(false);
    await act(async () => view().onMove(DOOR));
    expect(view().settling).toBe(true);
    await act(async () => view().onMove(BACK));
    await act(async () => late[0](named("Earlier")));
    expect(view().settling).toBe(true);
    await act(async () => late[1](named("Latest")));
    expect(view().settling).toBe(false);
  });

  it("releases Next when the moved spot has no name or the lookup fails", async () => {
    const late = heldAnswers();
    await picked();
    await act(async () => view().onMove(DOOR));
    await act(async () =>
      late[0](Response.json({ place: null, message: "No name here." })),
    );
    expect(view().settling).toBe(false);
    await act(async () => view().onMove(BACK));
    await act(async () =>
      late[1](
        Response.json({ error: { message: "Try again." } }, { status: 500 }),
      ),
    );
    expect(view().settling).toBe(false);
    expect(stored.has(pinKey("p1"))).toBe(false);
  });

  it("releases Next when the sender picks again mid-lookup", async () => {
    heldAnswers();
    await picked();
    await act(async () => view().onMove(DOOR));
    await act(async () => view().onPick(FISHTOWN));
    expect(view().settling).toBe(false);
  });
});
