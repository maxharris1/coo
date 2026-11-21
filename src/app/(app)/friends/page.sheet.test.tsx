import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncContext, type SyncState } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import type { FriendRow } from "@/server/services/friends";
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

const friend = (id: string, name: string): FriendRow =>
  ({
    id,
    name,
    handle: id,
    shows: "city",
    theyShow: "city",
    where: null,
    distanceMi: null,
  }) as FriendRow;

const PRIYA = friend("priya", "Priya");
const THEO = friend("theo", "Theo");

let failWith: { status: number; message: string } | null;
let root: Root;

function fakeFetch(url: RequestInfo | URL) {
  if (String(url) === "/api/friends") {
    return Promise.resolve(
      Response.json({ friends: [PRIYA, THEO], guestLinks: [] }),
    );
  }
  if (failWith) {
    return Promise.resolve(
      Response.json(
        { error: { message: failWith.message } },
        { status: failWith.status },
      ),
    );
  }
  return Promise.resolve(Response.json({}));
}

const p = () => view.props!;
const names = () => {
  const list = p().list;
  if (list.kind !== "ready") throw new Error("list is not ready");
  return list.friends.map((f) => f.name);
};
const actionCalls = () =>
  vi
    .mocked(fetch)
    .mock.calls.filter(([url]) => String(url) !== "/api/friends")
    .map(([url, init]) => ({
      url: String(url),
      method: init?.method,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    }));

beforeEach(async () => {
  failWith = null;
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

async function run(f: () => void) {
  await act(async () => f());
}

describe("/friends row sheet (ac-1)", () => {
  it("opens on the menu for the tapped friend and closes again", async () => {
    expect(p().sheet).toBeNull();
    await run(() => p().onOpen(PRIYA));
    expect(p().sheet).toEqual({ friend: PRIYA, step: "menu", busy: false });
    await run(() => p().onClose());
    expect(p().sheet).toBeNull();
    expect(actionCalls()).toEqual([]);
  });

  it("unfriends through DELETE /api/friends/[id] and drops the row", async () => {
    await run(() => p().onOpen(PRIYA));
    await run(() => p().onStep("unfriend"));
    expect(p().sheet?.step).toBe("unfriend");
    await run(() => p().onConfirm(""));
    expect(actionCalls()).toEqual([
      { url: "/api/friends/priya", method: "DELETE", body: undefined },
    ]);
    expect(names()).toEqual(["Theo"]);
    expect(p().sheet).toBeNull();
    expect(view.toasts).toHaveLength(1);
  });

  it("blocks through POST /api/friends/[id]/block and drops the row", async () => {
    await run(() => p().onOpen(THEO));
    await run(() => p().onStep("block"));
    await run(() => p().onConfirm(""));
    expect(actionCalls()).toEqual([
      { url: "/api/friends/theo/block", method: "POST", body: undefined },
    ]);
    expect(names()).toEqual(["Priya"]);
    expect(p().sheet).toBeNull();
  });

  it("reports through POST /api/reports and keeps the friend", async () => {
    await run(() => p().onOpen(PRIYA));
    await run(() => p().onStep("report"));
    await run(() => p().onConfirm("Rude notes"));
    expect(actionCalls()).toEqual([
      {
        url: "/api/reports",
        method: "POST",
        body: { userId: "priya", reason: "Rude notes" },
      },
    ]);
    expect(names()).toEqual(["Priya", "Theo"]);
    expect(p().sheet).toBeNull();
    expect(view.toasts).toHaveLength(1);
  });

  it("keeps the sheet and the row and shows the API's message on failure", async () => {
    failWith = { status: 403, message: "Not yours." };
    await run(() => p().onOpen(PRIYA));
    await run(() => p().onStep("block"));
    await run(() => p().onConfirm(""));
    expect(view.toasts).toEqual(["Not yours."]);
    expect(names()).toEqual(["Priya", "Theo"]);
    expect(p().sheet).toEqual({ friend: PRIYA, step: "block", busy: false });
  });
});
