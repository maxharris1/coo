import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncContext, type SyncState } from "@/components/SyncProvider";
import { ToastContext } from "@/components/Toasts";
import type { SyncPayload } from "@/components/sync";
import type { ComposeView, NoRecipient } from "./ComposeView";
import ComposePage from "./page";

type ViewProps = ComponentProps<typeof ComposeView>;

const seen = vi.hoisted(() => ({
  view: null as ViewProps | null,
  missing: null as string | null,
  loading: false,
  push: vi.fn(),
  toast: vi.fn(),
  to: "u2" as string | null,
}));

vi.mock("./ComposeView", () => ({
  ComposeView: (props: ViewProps) => {
    seen.view = props;
    return null;
  },
  NoRecipient: ({ message }: ComponentProps<typeof NoRecipient>) => {
    seen.missing = message;
    return null;
  },
}));
vi.mock("@/components/Loader", () => ({
  Loader: () => {
    seen.loading = true;
    return null;
  },
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: seen.push }),
  useSearchParams: () =>
    new URLSearchParams(seen.to === null ? "" : `to=${seen.to}`),
}));

const PRIYA = {
  id: "u2",
  name: "Priya",
  handle: "priya",
  where: "Philadelphia",
  distanceMi: 81.3,
};

const FLOCK = {
  breed: "city",
  gear: [],
  focus: 3,
  navigation: 3,
  level: 1,
  belly: 80,
  feathers: 80,
  energy: 80,
  sulking: false,
};

const BIRDS = [
  { ...FLOCK, id: "b1", name: "Gerald", speedMph: 45, canFly: true },
  { ...FLOCK, id: "b2", name: "Crumbs", speedMph: 52, canFly: true },
  { ...FLOCK, id: "b3", name: "Kevin", speedMph: 70, canFly: false },
];

let friends: { status: number; body: unknown };
let released: Promise<{ status: number; body: unknown }>;
let birds: unknown[];
let root: Root | null;

const sync = (): SyncState => ({
  data: { me: { units: "mi" }, birds } as unknown as SyncPayload,
  error: null,
  offsetMs: 0,
  refresh: () => {},
});

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
      <SyncContext.Provider value={sync()}>
        <ToastContext.Provider value={seen.toast}>
          <ComposePage />
        </ToastContext.Provider>
      </SyncContext.Provider>,
    ),
  );
}

const view = () => {
  if (!seen.view) throw new Error("ComposeView not shown");
  return seen.view;
};

const type = (text: string) => act(async () => view().onNote(text));

const fetchMock = vi.fn<typeof fetch>(async (url) => {
  const reply =
    String(url) === "/api/friends"
      ? friends
      : String(url) === "/api/flights"
        ? await released
        : { status: 404, body: {} };
  return Response.json(reply.body, { status: reply.status });
});

const flightCalls = () =>
  fetchMock.mock.calls.filter(([url]) => String(url) === "/api/flights");

beforeEach(() => {
  seen.view = null;
  seen.missing = null;
  seen.loading = false;
  seen.push.mockClear();
  seen.toast.mockClear();
  seen.to = "u2";
  fetchMock.mockClear();
  friends = { status: 200, body: { friends: [PRIYA], guestLinks: [] } };
  released = Promise.resolve({
    status: 201,
    body: { flights: [{ id: "f1" }] },
  });
  birds = BIRDS;
  root = null;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { HTMLIFrameElement: class {} }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(async () => {
  const r = root;
  await act(async () => r?.unmount());
  vi.unstubAllGlobals();
});

describe("Compose page (ac-1)", () => {
  it("shows the friend from ?to= and the fastest ready bird", async () => {
    await show();
    expect(view()).toMatchObject({
      recipient: {
        name: "Priya",
        line: "Philadelphia, 81 miles as the pigeon flies",
      },
      note: "",
      counter: { text: "0 of 140 characters", over: false },
      birdName: "Crumbs",
      sending: false,
    });
  });

  it("counts the note as it is typed", async () => {
    await show();
    await type("Dinner Saturday?");
    expect(view()).toMatchObject({
      note: "Dinner Saturday?",
      counter: { text: "16 of 140 characters", over: false },
    });
  });

  it("has no bird to release when nobody can fly", async () => {
    birds = [BIRDS[2]];
    await show();
    expect(view().birdName).toBeNull();
  });

  it("waits on the loader until the friends arrive", async () => {
    fetchMock.mockImplementationOnce(() => new Promise(() => {}));
    await show();
    expect(seen.loading).toBe(true);
    expect(seen.view).toBeNull();
  });

  it("says so when the friend is not in the address book", async () => {
    seen.to = "nobody";
    await show();
    expect(seen.view).toBeNull();
    expect(seen.missing).toBe("That friend is not in your address book.");
  });

  it("says so when there is no friend in the link", async () => {
    seen.to = null;
    await show();
    expect(seen.view).toBeNull();
    expect(seen.missing).toBe("That friend is not in your address book.");
  });

  it("shows the API's message when the friends fail to load", async () => {
    friends = {
      status: 500,
      body: {
        error: {
          code: "internal",
          message: "Something went sideways. Nothing was lost. Try again.",
        },
      },
    };
    await show();
    expect(seen.missing).toBe(
      "Something went sideways. Nothing was lost. Try again.",
    );
  });
});

describe("Compose page release (ac-2)", () => {
  it("releases the fastest ready bird and moves on to the takeoff", async () => {
    await show();
    await type("Dinner Saturday?");
    await act(async () => view().onRelease());
    const calls = flightCalls();
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({
      body: "Dinner Saturday?",
      sends: [{ friendId: "u2", birdId: "b2" }],
    });
    expect(seen.push).toHaveBeenCalledExactlyOnceWith("/send/takeoff/f1");
    expect(seen.toast).not.toHaveBeenCalled();
  });

  it("is sending while the release is in flight", async () => {
    let land!: (r: { status: number; body: unknown }) => void;
    released = new Promise((resolve) => (land = resolve));
    await show();
    await type("Dinner Saturday?");
    await act(async () => view().onRelease());
    expect(view().sending).toBe(true);
    expect(seen.push).not.toHaveBeenCalled();
    await act(async () =>
      land({ status: 201, body: { flights: [{ id: "f1" }] } }),
    );
    expect(seen.push).toHaveBeenCalledExactlyOnceWith("/send/takeoff/f1");
  });

  it("toasts the API's message and keeps the note when the release fails", async () => {
    released = Promise.resolve({
      status: 409,
      body: {
        error: { code: "conflict", message: "Crumbs is not home right now." },
      },
    });
    await show();
    await type("Dinner Saturday?");
    await act(async () => view().onRelease());
    expect(seen.toast).toHaveBeenCalledExactlyOnceWith(
      "Crumbs is not home right now.",
    );
    expect(seen.push).not.toHaveBeenCalled();
    expect(view()).toMatchObject({ note: "Dinner Saturday?", sending: false });
  });
});
