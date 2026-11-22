import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialLoft, loft, type LoftState } from "./roost";

const push = vi.hoisted(() => vi.fn());
const dispatch = vi.hoisted(() => vi.fn());
const current = vi.hoisted(() => ({ state: null as LoftState | null }));

vi.mock("react", async (actual) => ({
  ...(await actual<typeof import("react")>()),
  useReducer: () => [current.state ?? initialLoft(), dispatch],
  useEffect: () => {},
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { Loft } = await import("./Loft");

const CODE = "priya-AbCdEfGhIj_-";

type Actions = {
  home: () => Promise<void>;
  move: (p: { lat: number; lon: number }) => Promise<void>;
};
const actions = () =>
  (Loft() as ReactElement<{ actions: Actions }>).props.actions;
const home = () => actions().home();

describe("finishing onboarding", () => {
  beforeEach(() => {
    push.mockReset();
    dispatch.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("goes back to the invite the new user came from", async () => {
    vi.stubGlobal("document", { cookie: `coo_return=${CODE}` });
    await home();
    expect(push).toHaveBeenCalledWith(`/join/${CODE}`);
  });

  const pendingGuestLink = () =>
    new Map([
      [
        "coo_link",
        JSON.stringify({
          token: "AbCdEfGhIjKl",
          name: "Priya",
          phone: "+15550000077",
          at: Date.now(),
        }),
      ],
    ]);

  it("claims a pending guest link and goes where the claim lands", async () => {
    const store = pendingGuestLink();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      removeItem: (k: string) => store.delete(k),
    });
    vi.stubGlobal("document", { cookie: `coo_return=${CODE}` });
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ friendId: "u1", visitId: "v1" })),
    );
    await home();
    expect(push).toHaveBeenCalledWith("/sill/v1/reply");
  });

  it("stays on the loft with the error when the claim cannot reach the server", async () => {
    const store = pendingGuestLink();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      removeItem: (k: string) => store.delete(k),
    });
    vi.stubGlobal("document", { cookie: "" });
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    await home();
    expect(push).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({
      type: "failed",
      message: "We could not reach the loft. Try again.",
    });
    expect(store.has("coo_link")).toBe(true);
  });

  it("goes home when there is no invite", async () => {
    vi.stubGlobal("document", { cookie: "" });
    await home();
    expect(push).toHaveBeenCalledWith("/");
  });
});

describe("moving the roost pin", () => {
  const settled = { lat: 40.714, lon: -73.9625 };
  const picked = loft(initialLoft(), {
    type: "located",
    roost: {
      lat: 40.73,
      lon: -73.9875,
      label: "East Village",
      city: "New York, NY",
      placeId: "p1",
    },
    pending: null,
  });

  beforeEach(() => {
    push.mockReset();
    dispatch.mockReset();
  });
  afterEach(() => {
    current.state = null;
    vi.unstubAllGlobals();
  });

  it("names the settled spot and holds it to save", async () => {
    const urls: string[] = [];
    vi.stubGlobal("fetch", async (url: string) => {
      urls.push(url);
      return new Response(
        JSON.stringify({
          place: { label: "Williamsburg", city: "New York, NY" },
        }),
      );
    });
    current.state = picked;

    await actions().move(settled);

    expect(urls).toEqual(["/api/geo/here?lat=40.714&lon=-73.9625"]);
    expect(dispatch).toHaveBeenLastCalledWith({
      type: "located",
      roost: { ...settled, label: "Williamsburg", city: "New York, NY" },
      pending: settled,
    });
  });

  it("saves the moved roost through the {lat, lon} loft body on 'This is home'", async () => {
    const posts: unknown[] = [];
    vi.stubGlobal("document", { cookie: "" });
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      posts.push([url, init?.method, JSON.parse(String(init?.body))]);
      return new Response(
        JSON.stringify({
          loft: {
            ...settled,
            label: "Williamsburg",
            city: "New York, NY",
            travelling: false,
          },
        }),
      );
    });
    current.state = loft(picked, {
      type: "located",
      roost: { ...settled, label: "Williamsburg", city: "New York, NY" },
      pending: settled,
    });

    await home();

    expect(posts).toEqual([["/api/loft", "POST", settled]]);
    expect(push).toHaveBeenCalledWith("/");
  });

  it("after a failed move, 'This is home' saves the roost the pin still shows", async () => {
    const shown = { lat: 40.73, lon: -73.9875 };
    let state = loft(picked, {
      type: "located",
      roost: { ...shown, label: "East Village", city: "New York, NY" },
      pending: shown,
    });
    vi.stubGlobal("fetch", async () => {
      throw new Error("offline");
    });
    current.state = state;

    await actions().move(settled);

    for (const [action] of dispatch.mock.calls) state = loft(state, action);
    expect(state.error).not.toBeNull();
    expect(state.pending).toEqual(shown);
    expect({ lat: state.roost?.lat, lon: state.roost?.lon }).toEqual(shown);
  });
});
