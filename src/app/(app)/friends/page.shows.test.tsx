import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncContext, type SyncState } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import type { FriendRow, Shows } from "@/server/services/friends";
import type { FriendsViewProps } from "./FriendsView";
import FriendsPage from "./page";

const view = vi.hoisted(() => ({
  props: null as FriendsViewProps | null,
  toasts: [] as string[],
  toast: (message: string) => void view.toasts.push(message),
}));

vi.mock("./FriendsView", () => ({
  FriendsView: (props: FriendsViewProps) => {
    view.props = props;
    return null;
  },
}));

vi.mock("@/components/Toasts", () => ({
  useToast: () => view.toast,
}));

const friend = (id: string, shows: Shows): FriendRow =>
  ({
    id,
    name: id,
    handle: id,
    shows,
    theyShow: "city",
    where: null,
    distanceMi: null,
  }) as FriendRow;

let server: Map<string, Shows>;
let root: Root | null;
let heldLoads: (() => Promise<void>)[] | null;

type Patch = {
  id: string;
  shows: Shows;
  succeed: () => Promise<void>;
  fail: () => Promise<void>;
  cut: () => Promise<void>;
  settled: boolean;
};
let patches: Patch[];
let inFlight: Map<string, number>;
let maxInFlight: number;

function fakeFetch(url: RequestInfo | URL, init?: RequestInit) {
  const path = String(url);
  if (path === "/api/friends" && !init?.method) {
    const friends = [...server].map(([id, shows]) => friend(id, shows));
    const body = () => Response.json({ friends, guestLinks: [] });
    if (!heldLoads) return Promise.resolve(body());
    const loads = heldLoads;
    return new Promise<Response>((resolve) => {
      loads.push(() => act(async () => resolve(body())));
    });
  }
  const match = /^\/api\/friends\/([^/]+)$/.exec(path);
  if (match && init?.method === "PATCH") {
    const id = match[1];
    const { shows } = JSON.parse(String(init.body)) as { shows: Shows };
    inFlight.set(id, (inFlight.get(id) ?? 0) + 1);
    maxInFlight = Math.max(maxInFlight, inFlight.get(id)!);
    return new Promise<Response>((resolve) => {
      const settle = async (res: () => Response) => {
        patch.settled = true;
        inFlight.set(id, inFlight.get(id)! - 1);
        await act(async () => resolve(res()));
      };
      const patch: Patch = {
        id,
        shows,
        settled: false,
        succeed: () =>
          settle(() => {
            server.set(id, shows);
            return Response.json({ friend: friend(id, shows) });
          }),
        fail: () =>
          settle(() =>
            Response.json(
              { error: { message: "Slow down." } },
              { status: 429 },
            ),
          ),
        cut: () =>
          settle(() => {
            server.set(id, shows);
            const body = new ReadableStream({
              start: (c) => c.error(new TypeError("network error")),
            });
            return new Response(body, {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }),
      };
      patches.push(patch);
    });
  }
  return Promise.reject(new Error(`unexpected request ${path}`));
}

const pick = (id: string, shows: Shows) =>
  act(async () => view.props!.onShows(id, shows));

const shown = () => {
  const list = view.props?.list;
  if (list?.kind !== "ready") throw new Error("list is not ready");
  return Object.fromEntries(list.friends.map((f) => [f.id, f.shows]));
};

beforeEach(async () => {
  server = new Map([
    ["priya", "city"],
    ["theo", "block"],
  ]);
  view.toasts.length = 0;
  patches = [];
  inFlight = new Map();
  maxInFlight = 0;
  view.props = null;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), {
      HTMLIFrameElement: class {},
      location: { origin: "https://coo.test" },
    }),
  );
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
  heldLoads = null;
  await mount();
});

async function mount() {
  const container = Object.assign(new EventTarget(), {
    nodeType: 1,
    tagName: "DIV",
    ownerDocument: new EventTarget(),
  }) as unknown as Element;
  root = createRoot(container);
  const sync = {
    data: { me: { inviteCode: "max", units: "mi" } } as unknown as SyncPayload,
    error: null,
    offsetMs: 0,
    refresh: () => {},
  } satisfies SyncState;
  const r = root;
  await act(async () => {
    r.render(
      <SyncContext.Provider value={sync}>
        <FriendsPage />
      </SyncContext.Provider>,
    );
  });
}

async function unmount() {
  const r = root;
  root = null;
  view.props = null;
  if (r) await act(async () => r.unmount());
}

const pending = () => patches.filter((p) => !p.settled);

afterEach(async () => {
  await unmount();
  expect(pending()).toEqual([]);
  vi.unstubAllGlobals();
});

describe("/friends City/Block setting", () => {
  it("shows the value the server confirmed for each friend", () => {
    expect(shown()).toEqual({ priya: "city", theo: "block" });
  });

  it("saves a new choice and shows it once the server confirms it", async () => {
    await pick("priya", "block");
    expect(patches.map((p) => [p.id, p.shows])).toEqual([["priya", "block"]]);
    expect(shown().priya).toBe("city");
    await patches[0].succeed();
    expect(shown().priya).toBe("block");
    expect(server.get("priya")).toBe("block");
  });

  it("sends nothing when the choice is already the saved value", async () => {
    await pick("priya", "city");
    expect(patches).toEqual([]);
  });

  it("keeps the confirmed value and says why when a save fails", async () => {
    await pick("priya", "block");
    await patches[0].fail();
    expect(shown().priya).toBe("city");
    expect(view.toasts).toEqual(["Slow down."]);
  });

  it("never has two saves in flight for one friend and ends where the friend's view is (ac-2, ac-3)", async () => {
    await pick("priya", "block");
    await pick("priya", "city");
    expect(patches).toHaveLength(1);
    await patches[0].succeed();
    expect(shown().priya).toBe(server.get("priya"));
    expect(patches.map((p) => p.shows)).toEqual(["block", "city"]);
    await patches[1].succeed();
    expect(maxInFlight).toBe(1);
    expect(server.get("priya")).toBe("city");
    expect(shown().priya).toBe("city");
  });

  it("sends only the latest of several queued choices", async () => {
    await pick("priya", "block");
    await pick("priya", "city");
    await pick("priya", "block");
    await patches[0].succeed();
    expect(patches).toHaveLength(1);
    expect(shown()).toEqual({ priya: "block", theo: "block" });
    expect(server.get("priya")).toBe("block");
  });

  it("still sends the queued choice after a failed save", async () => {
    await pick("priya", "block");
    await pick("priya", "city");
    await pick("priya", "block");
    await patches[0].fail();
    expect(patches.map((p) => p.shows)).toEqual(["block", "block"]);
    await patches[1].succeed();
    expect(shown().priya).toBe("block");
    expect(maxInFlight).toBe(1);
  });

  it("saves different friends independently", async () => {
    await pick("priya", "block");
    await pick("theo", "city");
    expect(patches.map((p) => p.id)).toEqual(["priya", "theo"]);
    await patches[1].succeed();
    await patches[0].succeed();
    expect(shown()).toEqual({ priya: "block", theo: "city" });
  });

  it("keeps one save in flight per friend and shows the server's value across leaving and returning (f-1)", async () => {
    await pick("priya", "block");
    await pick("priya", "city");
    await unmount();
    await mount();
    await pick("priya", "block");
    while (pending().length > 0) await pending().at(-1)!.succeed();
    expect(maxInFlight).toBe(1);
    expect(shown().priya).toBe(server.get("priya"));
  });

  it("dispatches a choice queued before leaving and shows its result on return", async () => {
    await pick("priya", "block");
    await pick("priya", "city");
    await unmount();
    await mount();
    await patches[0].succeed();
    expect(patches.map((p) => p.shows)).toEqual(["block", "city"]);
    await patches[1].succeed();
    expect(server.get("priya")).toBe("city");
    expect(shown().priya).toBe("city");
    expect(maxInFlight).toBe(1);
  });

  it("shows a save that settles while the returning page is still loading", async () => {
    await pick("priya", "block");
    await unmount();
    heldLoads = [];
    await mount();
    await patches[0].succeed();
    await heldLoads[0]();
    expect(server.get("priya")).toBe("block");
    expect(shown().priya).toBe("block");
  });

  it("treats a cut-off response body as a failed save and sends the retry (f-2)", async () => {
    await pick("priya", "block");
    await patches[0].cut();
    expect(shown().priya).toBe("city");
    expect(view.toasts).toEqual(["We could not reach the loft. Try again."]);
    await pick("priya", "block");
    expect(patches).toHaveLength(2);
    await patches[1].succeed();
    expect(shown().priya).toBe("block");
    expect(server.get("priya")).toBe("block");
  });

  it("still sends the queued choice after a cut-off response body", async () => {
    await pick("priya", "block");
    await pick("priya", "city");
    await patches[0].cut();
    expect(patches.map((p) => p.shows)).toEqual(["block", "city"]);
    await patches[1].succeed();
    expect(shown().priya).toBe("city");
    expect(server.get("priya")).toBe("city");
  });
});
