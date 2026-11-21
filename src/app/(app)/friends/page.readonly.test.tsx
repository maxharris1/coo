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
let root: Root;

function fakeFetch(url: RequestInfo | URL) {
  const friends = [...server].map(([id, shows]) => friend(id, shows));
  return String(url) === "/api/friends"
    ? Promise.resolve(Response.json({ friends, guestLinks: [] }))
    : Promise.reject(new Error(`unexpected request ${String(url)}`));
}

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

describe("/friends City/Block setting", () => {
  it("shows the value the server confirmed for each friend", () => {
    expect(shown()).toEqual({ priya: "city", theo: "block" });
  });

  it("offers the view no way to change it", () => {
    expect(Object.keys(view.props!)).not.toContain("onShows");
    expect(vi.mocked(fetch).mock.calls.map(([url]) => String(url))).toEqual([
      "/api/friends",
    ]);
  });
});
