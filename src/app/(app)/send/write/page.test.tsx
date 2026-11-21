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
  look: "gerald",
  breed: "city",
  status: "home",
  hungry: false,
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
  {
    ...FLOCK,
    id: "b1",
    name: "Gerald",
    speedMph: 45,
    canFly: true,
    gear: ["tube"],
  },
  { ...FLOCK, id: "b2", name: "Crumbs", speedMph: 52, canFly: true },
  { ...FLOCK, id: "b3", name: "Kevin", speedMph: 70, canFly: false },
  {
    ...FLOCK,
    id: "b4",
    name: "Pip",
    speedMph: 30,
    canFly: true,
    hungry: true,
  },
];

const RELEASE = Date.parse("2026-11-20T14:32:00Z");

const legFor = (birdIds: string[]) => ({
  recipient: { friendId: "u2" },
  distanceMi: 81.3,
  from: { label: "New York" },
  to: { label: "Philadelphia" },
  quotes: birdIds.map((birdId) => ({
    birdId,
    releaseAt: RELEASE,
    durationMs: 108 * 60_000,
    arriveAt: RELEASE + 108 * 60_000,
    odds: birdId === "b1" ? 0.94 : 0.81,
    roostsOvernight: false,
    factors: [
      { kind: "clear", text: "Clear skies over Jersey", effect: "none" },
    ],
    sunsetAt: RELEASE,
  })),
});

let friends: { status: number; body: unknown };
let quoted: (birdIds: string[]) => Promise<{ status: number; body: unknown }>;
let released: Promise<{ status: number; body: unknown }>;
let birds: unknown[];
let root: Root | null;

const sync = (): SyncState => ({
  data: {
    me: { units: "mi", timezone: "America/New_York" },
    birds,
  } as unknown as SyncPayload,
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

const fetchMock = vi.fn<typeof fetch>(async (url, init) => {
  const path = String(url);
  const reply =
    path === "/api/friends"
      ? friends
      : path === "/api/flights"
        ? await released
        : path === "/api/flights/quote"
          ? await quoted(JSON.parse(String(init?.body)).birdIds)
          : { status: 404, body: {} };
  return Response.json(reply.body, { status: reply.status });
});

const flightCalls = () =>
  fetchMock.mock.calls.filter(([url]) => String(url) === "/api/flights");

const quoteBodies = () =>
  fetchMock.mock.calls
    .filter(([url]) => String(url) === "/api/flights/quote")
    .map(([, init]) => JSON.parse(String(init?.body)));

const pick = (id: string) => act(async () => view().onPick(id));

const releaseLabel = () =>
  view().birds.find((b) => b.id === view().pickedId)?.name ?? null;

beforeEach(() => {
  seen.view = null;
  seen.missing = null;
  seen.loading = false;
  seen.push.mockClear();
  seen.toast.mockClear();
  seen.to = "u2";
  fetchMock.mockClear();
  friends = { status: 200, body: { friends: [PRIYA], guestLinks: [] } };
  quoted = async (birdIds) => ({
    status: 200,
    body: { recipients: [legFor(birdIds)] },
  });
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
      pickedId: "b2",
      forecastHref: "/send/forecast?to=u2",
      sending: false,
    });
    expect(releaseLabel()).toBe("Crumbs");
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
    expect(view().pickedId).toBeNull();
    expect(view().stats).toBeNull();
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

describe("Compose page picker (ac-1)", () => {
  it("offers every bird with its state", async () => {
    await show();
    expect(
      view().birds.map((b) => [b.name, b.speed, b.chip, b.state.kind]),
    ).toEqual([
      ["Gerald", "45 mph", "Ready", "ready"],
      ["Crumbs", "52 mph", "Ready", "ready"],
      ["Kevin", "70 mph", "Too tired", "blocked"],
      ["Pip", "30 mph", "Hungry", "hungry"],
    ]);
  });

  it("quotes the default bird", async () => {
    await show();
    expect(quoteBodies()).toEqual([
      { recipients: [{ friendId: "u2" }], birdIds: ["b2"] },
    ]);
  });

  it("switches Release, the counter's limit and the quote to the picked bird", async () => {
    await show();
    await type("Dinner Saturday?");
    await pick("b1");
    expect(releaseLabel()).toBe("Gerald");
    expect(view().counter).toEqual({
      text: "16 of 280 characters",
      over: false,
    });
    expect(quoteBodies().at(-1)).toEqual({
      recipients: [{ friendId: "u2" }],
      birdIds: ["b1"],
    });
    expect(view().stats?.odds).toBe("94%");
  });

  it("lets a hungry bird be picked", async () => {
    await show();
    await pick("b4");
    expect(view().pickedId).toBe("b4");
    expect(releaseLabel()).toBe("Pip");
  });

  it("ignores a pick of a blocked bird", async () => {
    await show();
    await pick("b3");
    expect(view().pickedId).toBe("b2");
    expect(quoteBodies().map((b) => b.birdIds)).toEqual([["b2"]]);
  });

  it("releases the picked bird", async () => {
    await show();
    await pick("b1");
    await type("Dinner Saturday?");
    await act(async () => view().onRelease());
    expect(JSON.parse(String(flightCalls()[0][1]?.body))).toEqual({
      body: "Dinner Saturday?",
      sends: [{ friendId: "u2", birdId: "b1" }],
    });
  });
});

describe("Compose page stats (ac-2)", () => {
  it("shows the quote's stats and forecast line", async () => {
    await show();
    expect(view().stats).toEqual({
      distance: "81 mi",
      flightTime: "1h 48m",
      odds: "81%",
      forecast: "Lands around 11:20 am. Clear skies over Jersey.",
    });
  });

  it("drops the old bird's stats while the new quote is on its way", async () => {
    await show();
    quoted = () => new Promise(() => {});
    await pick("b1");
    expect(view().stats).toBeNull();
  });

  it("toasts the API's message when the quote fails", async () => {
    quoted = async () => ({
      status: 500,
      body: {
        error: {
          code: "internal",
          message: "Something went sideways. Nothing was lost. Try again.",
        },
      },
    });
    await show();
    expect(view().stats).toBeNull();
    expect(seen.toast).toHaveBeenCalledExactlyOnceWith(
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
