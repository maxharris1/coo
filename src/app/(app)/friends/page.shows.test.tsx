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

type Patch = { id: string; shows: Shows; settle: (status: number) => void };

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
let patches: Patch[];
let root: Root;

function fakeFetch(url: RequestInfo | URL, init?: RequestInit) {
  const path = String(url);
  if (path === "/api/friends") {
    const friends = [...server].map(([id, shows]) => friend(id, shows));
    return Promise.resolve(Response.json({ friends, guestLinks: [] }));
  }
  const id = decodeURIComponent(path.slice("/api/friends/".length));
  const { shows } = JSON.parse(String(init?.body)) as { shows: Shows };
  return new Promise<Response>((resolve) => {
    patches.push({
      id,
      shows,
      settle: (status) => {
        if (status === 200) server.set(id, shows);
        resolve(Response.json({}, { status }));
      },
    });
  });
}

const shown = (id: string) => {
  const list = view.props?.list;
  if (list?.kind !== "ready") throw new Error("list is not ready");
  return list.friends.find((f) => f.id === id)?.shows;
};

const pick = (id: string, shows: Shows) =>
  act(async () => view.props!.onShows(id, shows));

const settle = (patch: Patch, status: number) =>
  act(async () => {
    patch.settle(status);
  });

beforeEach(async () => {
  server = new Map([
    ["priya", "city"],
    ["theo", "city"],
  ]);
  patches = [];
  view.toasts.length = 0;
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
  await act(async () => {
    root.render(
      <SyncContext.Provider value={sync}>
        <FriendsPage />
      </SyncContext.Provider>,
    );
  });
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

describe("/friends City/Block saves", () => {
  it("ignores a late failure from a save that newer saves replaced", async () => {
    await pick("priya", "block");
    const [a] = patches;
    await pick("priya", "city");
    await settle(patches[1], 200);
    await pick("priya", "block");
    await settle(patches[2], 200);
    await settle(a, 500);

    expect(server.get("priya")).toBe("block");
    expect(shown("priya")).toBe(server.get("priya"));
    expect(view.toasts).toEqual([]);
  });

  it("rolls back to the confirmed value when every save fails", async () => {
    await pick("priya", "block");
    await pick("priya", "city");
    await settle(patches[0], 500);
    await settle(patches[1], 500);

    expect(server.get("priya")).toBe("city");
    expect(shown("priya")).toBe(server.get("priya"));
    expect(view.toasts).toHaveLength(1);
  });

  it("shows Block when an older Block save succeeds after the newer save failed", async () => {
    await pick("priya", "block");
    await pick("priya", "city");
    await settle(patches[1], 500);
    expect(shown("priya")).toBe("city");
    await settle(patches[0], 200);

    expect(server.get("priya")).toBe("block");
    expect(shown("priya")).toBe("block");
  });

  it("rolls back to an older success that landed before the newer save failed", async () => {
    await pick("priya", "block");
    await pick("priya", "city");
    await settle(patches[0], 200);
    expect(shown("priya")).toBe("city");
    await settle(patches[1], 500);

    expect(server.get("priya")).toBe("block");
    expect(shown("priya")).toBe("block");
  });

  it("keeps each friend's saves apart", async () => {
    await pick("priya", "block");
    await pick("theo", "block");
    await settle(patches[1], 200);
    await settle(patches[0], 500);

    expect(shown("priya")).toBe("city");
    expect(shown("theo")).toBe("block");
  });
});
