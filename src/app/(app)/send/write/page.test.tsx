import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncContext, type SyncState } from "@/components/SyncProvider";
import { ToastContext } from "@/components/Toasts";
import type { SyncPayload } from "@/components/sync";
import type { Doodle } from "@/lib/game/notes";
import { takeLink } from "../share/[flightId]/linkHandoff";
import type { ComposeView, NoRecipient } from "./ComposeView";
import { pinKey } from "./guest";
import ComposePage from "./page";

type ViewProps = ComponentProps<typeof ComposeView>;

const seen = vi.hoisted(() => ({
  view: null as ViewProps | null,
  missing: null as string | null,
  loading: false,
  push: vi.fn(),
  toast: vi.fn(),
  to: "u2" as string | string[] | null,
  guest: {} as Record<string, string>,
  drafts: new Map<string, unknown>(),
}));

vi.mock("../forecast/draft", () => ({
  readDraft: (friendId: string) => seen.drafts.get(friendId) ?? null,
  saveDraft: (d: { friendId: string }) => seen.drafts.set(d.friendId, d),
  clearDraft: (friendId: string) => seen.drafts.delete(friendId),
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
    new URLSearchParams([
      ...[seen.to ?? []].flat().map((id) => ["to", id]),
      ...Object.entries(seen.guest),
    ]),
}));

const PRIYA = {
  id: "u2",
  name: "Priya",
  handle: "priya",
  where: "Philadelphia",
  distanceMi: 81.3,
};

const ALEX = {
  ...PRIYA,
  id: "u3",
  name: "Alex",
  handle: "alex",
  where: "Boston",
  distanceMi: 215,
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

const SAM = {
  ...PRIYA,
  id: "u4",
  name: "Sam",
  handle: "sam",
  where: "Albany",
  distanceMi: 136,
};

const RELEASE = Date.parse("2026-11-20T14:32:00Z");

const MILES: Record<string, number> = { u2: 81.3, u3: 215, u4: 136 };

type QuoteBody = {
  recipients: ({ friendId: string } | { place: { placeId: string } })[];
  birdIds: string[];
};

const legFor = (birdIds: string[], friendId = "u2") => ({
  recipient: { friendId },
  distanceMi: MILES[friendId],
  from: { label: "New York" },
  to: { label: "Philadelphia" },
  quotes: birdIds.map((birdId) => ({
    birdId,
    releaseAt: RELEASE,
    leavesAt: RELEASE,
    airTimeMs: 108 * 60_000,
    durationMs: 108 * 60_000,
    arriveAt: RELEASE + 108 * 60_000,
    odds: birdId === "b1" ? 0.94 : 0.81,
    roostsOvernight: false,
    fliesInDark: false,
    factors: [
      { kind: "clear", text: "Clear skies over Jersey", effect: "none" },
    ],
    sunsetAt: RELEASE,
    espresso: variants[birdId] ?? null,
  })),
});

const placeLeg = (birdIds: string[], recipient: unknown) => ({
  ...legFor(birdIds),
  recipient,
  to: { label: "Fishtown, Philadelphia" },
});

const NIGHT_RUN = {
  leavesAt: RELEASE,
  airTimeMs: 9 * 60 * 60_000,
  durationMs: 9 * 60 * 60_000,
  arriveAt: RELEASE + 9 * 60 * 60_000,
  odds: 0.77,
  roostsOvernight: false,
  fliesInDark: true,
  factors: [{ kind: "night", text: "Flying in the dark", effect: "3% off" }],
};

let variants: Record<string, typeof NIGHT_RUN>;
let shotsHeld: number;
let friends: { status: number; body: unknown };
let quoted: (body: QuoteBody) => Promise<{ status: number; body: unknown }>;
let released: Promise<{ status: number; body: unknown }>;
let birds: unknown[];
let woke: { status: number; body: unknown };
let onRefresh: () => void;
let root: Root | null;

const sync = (): SyncState => ({
  data: {
    me: {
      units: "mi",
      timezone: "America/New_York",
      espressoShots: shotsHeld,
    },
    birds,
  } as unknown as SyncPayload,
  error: null,
  offsetMs: 0,
  refresh: () => onRefresh(),
});

const page = () => (
  <SyncContext.Provider value={sync()}>
    <ToastContext.Provider value={seen.toast}>
      <ComposePage />
    </ToastContext.Provider>
  </SyncContext.Provider>
);

async function show() {
  const container = Object.assign(new EventTarget(), {
    nodeType: 1,
    tagName: "DIV",
    ownerDocument: new EventTarget(),
  }) as unknown as Element;
  const r = createRoot(container);
  root = r;
  await act(async () => r.render(page()));
}

const sendTo = (friendId: string | string[]) => {
  seen.to = friendId;
  return act(async () => root?.render(page()));
};

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
          ? await quoted(JSON.parse(String(init?.body)))
          : path.endsWith("/wake")
            ? woke
            : { status: 404, body: {} };
  return Response.json(reply.body, { status: reply.status });
});

const flightCalls = () =>
  fetchMock.mock.calls.filter(([url]) => String(url) === "/api/flights");

const quoteBodies = () =>
  fetchMock.mock.calls
    .filter(([url]) => String(url) === "/api/flights/quote")
    .map(([, init]) => JSON.parse(String(init?.body)));

const row = (i = 0) => view().rows[i];

const pickFor = (friendId: string, id: string) =>
  act(async () => view().onPick(friendId, id));

const pick = (id: string) => pickFor(row().id, id);

const releaseLabel = () =>
  view().birds.find((b) => b.id === row().pickedId)?.name ?? null;

beforeEach(() => {
  seen.view = null;
  seen.missing = null;
  seen.loading = false;
  seen.push.mockClear();
  seen.toast.mockClear();
  seen.to = "u2";
  seen.guest = {};
  seen.drafts.clear();
  fetchMock.mockClear();
  friends = { status: 200, body: { friends: [PRIYA], guestLinks: [] } };
  quoted = async ({ recipients, birdIds }) => ({
    status: 200,
    body: {
      recipients: recipients.map((r) =>
        "friendId" in r ? legFor(birdIds, r.friendId) : placeLeg(birdIds, r),
      ),
    },
  });
  released = Promise.resolve({
    status: 201,
    body: { flights: [{ id: "f1" }] },
  });
  birds = BIRDS;
  variants = {};
  shotsHeld = 2;
  woke = { status: 200, body: {} };
  onRefresh = () => {};
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
      rows: [
        {
          id: "u2",
          recipient: {
            name: "Priya",
            line: "Philadelphia, 81 miles as the pigeon flies",
          },
          pickedId: "b2",
          tooLong: false,
          forecastHref: "/send/forecast?to=u2",
        },
      ],
      note: "",
      counter: { text: "0 of 140 characters", over: false },
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
    expect(row().pickedId).toBeNull();
    expect(row().stats).toBeNull();
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
    expect(row().stats?.odds).toBe("94%");
  });

  it("lets a hungry bird be picked", async () => {
    await show();
    await pick("b4");
    expect(row().pickedId).toBe("b4");
    expect(releaseLabel()).toBe("Pip");
  });

  it("ignores a pick of a blocked bird", async () => {
    await show();
    await pick("b3");
    expect(row().pickedId).toBe("b2");
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

describe("Compose page wake", () => {
  const DOT = {
    ...FLOCK,
    id: "b5",
    name: "Dot",
    speedMph: 60,
    canFly: false,
    status: "busy",
    busyKind: "nap",
  };

  const wakeDot = async (after: Record<string, unknown>) => {
    birds = [BIRDS[2], DOT];
    const refreshed = new Promise<void>((resolve) => {
      onRefresh = () => {
        birds = [
          BIRDS[2],
          { ...DOT, status: "home", busyKind: null, ...after },
        ];
        resolve();
      };
    });
    await show();
    expect(view().birds.find((b) => b.id === "b5")).toMatchObject({
      chip: "Napping",
      state: { kind: "blocked" },
      wakes: true,
    });
    await act(async () => {
      view().onWake("b5");
      await refreshed;
    });
    await act(async () => root?.render(page()));
    return fetchMock.mock.calls
      .filter(([url]) => String(url).startsWith("/api/birds/"))
      .map(([url, init]) => `${init?.method} ${String(url)}`);
  };

  it("wakes the napper, refreshes, and the bird is ready to pick", async () => {
    const calls = await wakeDot({ canFly: true });
    expect(calls).toEqual(["POST /api/birds/b5/wake"]);
    expect(view().birds.find((b) => b.id === "b5")).toMatchObject({
      chip: "Ready",
      state: { kind: "ready" },
      wakes: false,
    });
    expect(row().pickedId).toBe("b5");
    expect(seen.toast).not.toHaveBeenCalled();
  });

  it("shows a woken bird that cannot fly yet as too tired", async () => {
    await wakeDot({ tired: true, canFly: false });
    expect(view().birds.find((b) => b.id === "b5")).toMatchObject({
      chip: "Too tired",
      state: { kind: "blocked" },
    });
    expect(row().pickedId).toBeNull();
  });

  it("toasts the server's message and still refreshes when the wake fails", async () => {
    woke = {
      status: 409,
      body: { error: { code: "conflict", message: "Dot is not napping." } },
    };
    const calls = await wakeDot({ canFly: true });
    expect(calls).toEqual(["POST /api/birds/b5/wake"]);
    expect(seen.toast).toHaveBeenCalledExactlyOnceWith("Dot is not napping.");
  });
});

describe("Compose page stats (ac-2)", () => {
  it("shows the quote's stats and forecast line", async () => {
    await show();
    expect(row().stats).toEqual({
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
    expect(row().stats).toBeNull();
  });

  it("drops the old friend's stats while the new friend's quote is on its way", async () => {
    friends = { status: 200, body: { friends: [PRIYA, ALEX], guestLinks: [] } };
    await show();
    expect(row().stats?.distance).toBe("81 mi");
    quoted = () => new Promise(() => {});
    await sendTo("u3");
    expect(row().recipient.name).toBe("Alex");
    expect(row().stats).toBeNull();
  });

  it("shows no stats when the new friend's quote fails", async () => {
    friends = { status: 200, body: { friends: [PRIYA, ALEX], guestLinks: [] } };
    await show();
    expect(row().stats?.distance).toBe("81 mi");
    quoted = async () => ({
      status: 500,
      body: { error: { code: "internal", message: "Quote unavailable" } },
    });
    await sendTo("u3");
    expect(row().recipient.name).toBe("Alex");
    expect(seen.toast).toHaveBeenCalledExactlyOnceWith("Quote unavailable");
    expect(row().stats).toBeNull();
  });

  it("drops the bird's old stats when it is picked again", async () => {
    await show();
    expect(row().stats?.odds).toBe("81%");
    quoted = () => new Promise(() => {});
    await pick("b1");
    await pick("b2");
    expect(row().pickedId).toBe("b2");
    expect(row().stats).toBeNull();
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
    expect(row().stats).toBeNull();
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

const DOODLE: Doodle = {
  v: 1,
  w: 300,
  h: 200,
  strokes: [{ color: "ink", width: "fine", points: [[10, 20]] }],
};

const draw = (doodle: Doodle | null) =>
  act(async () => view().onDoodle(doodle));

const releasedBody = () => JSON.parse(String(flightCalls()[0][1]?.body));

describe("Compose page doodle", () => {
  it("starts with an empty pad", async () => {
    await show();
    expect(view().doodle).toBeNull();
  });

  it("releases a doodle with no text", async () => {
    await show();
    await draw(DOODLE);
    expect(view().doodle).toEqual(DOODLE);
    await act(async () => view().onRelease());
    expect(releasedBody()).toEqual({
      body: "",
      doodle: DOODLE,
      sends: [{ friendId: "u2", birdId: "b2" }],
    });
    expect(seen.push).toHaveBeenCalledExactlyOnceWith("/send/takeoff/f1");
  });

  it("releases the words and the doodle together", async () => {
    await show();
    await type("Dinner Saturday?");
    await draw(DOODLE);
    await act(async () => view().onRelease());
    expect(releasedBody()).toMatchObject({
      body: "Dinner Saturday?",
      doodle: DOODLE,
    });
  });

  it("leaves the doodle out once the pad is cleared", async () => {
    await show();
    await type("Dinner Saturday?");
    await draw(DOODLE);
    await draw(null);
    await act(async () => view().onRelease());
    expect(releasedBody()).toEqual({
      body: "Dinner Saturday?",
      sends: [{ friendId: "u2", birdId: "b2" }],
    });
  });

  it("keeps the words and the doodle and toasts when the release fails", async () => {
    released = Promise.resolve({
      status: 500,
      body: { error: { code: "internal", message: "Something broke." } },
    });
    await show();
    await type("Dinner Saturday?");
    await draw(DOODLE);
    await act(async () => view().onRelease());
    expect(seen.toast).toHaveBeenCalledExactlyOnceWith("Something broke.");
    expect(seen.push).not.toHaveBeenCalled();
    expect(view()).toMatchObject({
      note: "Dinner Saturday?",
      doodle: DOODLE,
      sending: false,
    });
  });

  it("keeps the words and the doodle and toasts when the phone is offline", async () => {
    const offline = Promise.reject(new TypeError("Failed to fetch"));
    offline.catch(() => {});
    released = offline;
    await show();
    await type("Dinner Saturday?");
    await draw(DOODLE);
    await act(async () => view().onRelease());
    expect(seen.toast).toHaveBeenCalledExactlyOnceWith(
      "We could not reach the loft. Try again.",
    );
    expect(view()).toMatchObject({
      note: "Dinner Saturday?",
      doodle: DOODLE,
      sending: false,
    });
  });
});

describe("Compose page draft for the forecast", () => {
  it("hands the note and the picked bird to the forecast as it is typed", async () => {
    await show();
    expect(seen.drafts.get("u2")).toEqual({
      friendId: "u2",
      birdId: "b2",
      body: "",
    });
    await type("Dinner Saturday?");
    await pick("b1");
    expect(seen.drafts.get("u2")).toEqual({
      friendId: "u2",
      birdId: "b1",
      body: "Dinner Saturday?",
    });
  });

  it("restores the saved note and bird when it comes back from the forecast", async () => {
    const saved = { friendId: "u2", birdId: "b1", body: "Dinner Saturday?" };
    seen.drafts.set("u2", saved);
    await show();
    expect(view().note).toBe("Dinner Saturday?");
    expect(row().pickedId).toBe("b1");
    expect(seen.drafts.get("u2")).toEqual(saved);
  });

  it("keeps the default bird when the saved one can no longer fly", async () => {
    seen.drafts.set("u2", { friendId: "u2", birdId: "b3", body: "Hi" });
    await show();
    expect(view().note).toBe("Hi");
    expect(row().pickedId).toBe("b2");
  });

  it("writes no draft without a friend or a bird that can fly", async () => {
    seen.to = "nobody";
    await show();
    expect(seen.drafts.size).toBe(0);
    seen.to = "u2";
    birds = [BIRDS[2]];
    await act(async () => root?.render(page()));
    expect(seen.drafts.size).toBe(0);
  });

  it("drafts for the friend the note is now addressed to", async () => {
    friends = { status: 200, body: { friends: [PRIYA, ALEX], guestLinks: [] } };
    await show();
    await type("Dinner Saturday?");
    await sendTo("u3");
    expect(seen.drafts.get("u3")).toEqual({
      friendId: "u3",
      birdId: "b2",
      body: "Dinner Saturday?",
    });
  });

  it("clears the draft once the bird is released", async () => {
    await show();
    await type("Dinner Saturday?");
    await act(async () => view().onRelease());
    expect(seen.push).toHaveBeenCalledExactlyOnceWith("/send/takeoff/f1");
    expect(seen.drafts.has("u2")).toBe(false);
  });

  it("keeps the draft when the release fails", async () => {
    released = Promise.resolve({
      status: 409,
      body: {
        error: { code: "conflict", message: "Crumbs is not home right now." },
      },
    });
    await show();
    await type("Dinner Saturday?");
    await act(async () => view().onRelease());
    expect(seen.drafts.get("u2")).toEqual({
      friendId: "u2",
      birdId: "b2",
      body: "Dinner Saturday?",
    });
  });
});

const FOUR_FRIENDS = { friends: [PRIYA, ALEX, SAM], guestLinks: [] };

describe("Compose page for several recipients", () => {
  beforeEach(() => {
    friends = { status: 200, body: FOUR_FRIENDS };
    seen.to = ["u2", "u3", "u4"];
    released = Promise.resolve({
      status: 201,
      body: { flights: [{ id: "f1" }, { id: "f2" }, { id: "f3" }] },
    });
  });

  it("three recipients show three rows and Release posts three sends and goes to Takeoff for the first flight", async () => {
    await show();
    expect(
      view().rows.map((r) => [r.id, r.recipient.name, r.pickedId]),
    ).toEqual([
      ["u2", "Priya", "b4"],
      ["u3", "Alex", "b2"],
      ["u4", "Sam", "b1"],
    ]);
    expect(view().rows.map((r) => r.forecastHref)).toEqual([
      "/send/forecast?to=u2",
      "/send/forecast?to=u3",
      "/send/forecast?to=u4",
    ]);
    expect(quoteBodies()).toEqual([
      {
        recipients: [
          { friendId: "u2" },
          { friendId: "u3" },
          { friendId: "u4" },
        ],
        birdIds: ["b1", "b2", "b4"],
      },
    ]);
    expect(view().rows.map((r) => r.stats?.distance)).toEqual([
      "81 mi",
      "215 mi",
      "136 mi",
    ]);
    expect(view().rows.map((r) => r.stats?.odds)).toEqual([
      "81%",
      "81%",
      "94%",
    ]);

    await type("Dinner Saturday?");
    await act(async () => view().onRelease());
    const calls = flightCalls();
    expect(calls).toHaveLength(1);
    expect(JSON.parse(String(calls[0][1]?.body))).toEqual({
      body: "Dinner Saturday?",
      sends: [
        { friendId: "u2", birdId: "b4" },
        { friendId: "u3", birdId: "b2" },
        { friendId: "u4", birdId: "b1" },
      ],
    });
    expect(seen.push).toHaveBeenCalledExactlyOnceWith("/send/takeoff/f1");
    expect(seen.drafts.size).toBe(0);
  });

  it("swaps birds between two rows without a new quote", async () => {
    await show();
    await pickFor("u2", "b2");
    expect(view().rows.map((r) => r.pickedId)).toEqual(["b2", "b4", "b1"]);
    expect(quoteBodies()).toHaveLength(1);
    expect(view().rows.map((r) => r.stats?.odds)).toEqual([
      "81%",
      "81%",
      "94%",
    ]);
    await type("Dinner Saturday?");
    await act(async () => view().onRelease());
    expect(JSON.parse(String(flightCalls()[0][1]?.body)).sends).toEqual([
      { friendId: "u2", birdId: "b2" },
      { friendId: "u3", birdId: "b4" },
      { friendId: "u4", birdId: "b1" },
    ]);
  });

  it("ignores a pick of a blocked bird on any row", async () => {
    await show();
    await pickFor("u3", "b3");
    expect(view().rows.map((r) => r.pickedId)).toEqual(["b4", "b2", "b1"]);
  });

  it("says so when one of several friends is not in the address book", async () => {
    seen.to = ["u2", "nobody", "u3"];
    await show();
    expect(seen.view).toBeNull();
    expect(seen.missing).toBe("That friend is not in your address book.");
  });

  it("shows a friend named twice in the link once", async () => {
    seen.to = ["u2", "u2"];
    await show();
    expect(view().rows.map((r) => r.id)).toEqual(["u2"]);
  });

  it("counts against the smallest note limit and flags each row that overflows", async () => {
    await show();
    await type("x".repeat(200));
    expect(view().counter).toEqual({
      text: "200 of 140 characters",
      over: true,
    });
    expect(view().rows.map((r) => r.tooLong)).toEqual([true, true, false]);
  });

  it("leaves a row without a bird when the flock runs short", async () => {
    birds = [BIRDS[0], BIRDS[2]];
    await show();
    expect(view().rows.map((r) => r.pickedId)).toEqual([null, "b1", null]);
    expect(view().rows.map((r) => r.stats)).toEqual([
      null,
      expect.objectContaining({ distance: "215 mi" }),
      null,
    ]);
  });

  it("drafts every row and keeps them when the release fails", async () => {
    released = Promise.resolve({
      status: 409,
      body: {
        error: { code: "conflict", message: "Crumbs is not home right now." },
      },
    });
    await show();
    await type("Hi all");
    await act(async () => view().onRelease());
    expect([...seen.drafts.values()]).toEqual([
      { friendId: "u2", birdId: "b4", body: "Hi all" },
      { friendId: "u3", birdId: "b2", body: "Hi all" },
      { friendId: "u4", birdId: "b1", body: "Hi all" },
    ]);
    expect(seen.toast).toHaveBeenCalledExactlyOnceWith(
      "Crumbs is not home right now.",
    );
  });
});

describe("Compose page espresso (ac-2, ac-3)", () => {
  const tick = (rowId: string, on = true) =>
    act(async () => view().onEspresso(rowId, on));
  const releaseNow = async () => {
    await type("Dinner Saturday?");
    await act(async () => view().onRelease());
    return JSON.parse(String(flightCalls()[0][1]?.body)).sends;
  };

  it("offers the shot only for a picked bird whose quote has the variant", async () => {
    variants = { b1: NIGHT_RUN };
    await show();
    expect(row().pickedId).toBe("b2");
    expect(row().espresso).toBeNull();
    await pick("b1");
    expect(row().espresso).toEqual({
      label: "Espresso shot · keep Gerald up tonight",
      ticked: false,
      disabled: false,
    });
  });

  it("disables the shot when none are held", async () => {
    variants = { b2: NIGHT_RUN };
    shotsHeld = 0;
    await show();
    expect(row().espresso).toMatchObject({ ticked: false, disabled: true });
  });

  it("releases with the shot on the ticked bird", async () => {
    variants = { b2: NIGHT_RUN };
    await show();
    await tick("u2");
    expect(row().espresso?.ticked).toBe(true);
    expect(await releaseNow()).toEqual([
      { friendId: "u2", birdId: "b2", espresso: true },
    ]);
  });

  it("releases without the flag when the shot is not ticked", async () => {
    variants = { b2: NIGHT_RUN };
    await show();
    await tick("u2");
    await tick("u2", false);
    const [send] = await releaseNow();
    expect(send).toEqual({ friendId: "u2", birdId: "b2" });
    expect(send).not.toHaveProperty("espresso");
  });

  it("clears the shot when another bird is picked", async () => {
    variants = { b1: NIGHT_RUN, b2: NIGHT_RUN };
    await show();
    await tick("u2");
    await pick("b1");
    expect(row().espresso).toEqual({
      label: "Espresso shot · keep Gerald up tonight",
      ticked: false,
      disabled: false,
    });
    expect(await releaseNow()).toEqual([{ friendId: "u2", birdId: "b1" }]);
  });

  it("keeps the shot cleared when the first bird is picked again", async () => {
    variants = { b1: NIGHT_RUN, b2: NIGHT_RUN };
    await show();
    await tick("u2");
    await pick("b1");
    await pick("b2");
    expect(row().espresso?.ticked).toBe(false);
    expect(await releaseNow()).toEqual([{ friendId: "u2", birdId: "b2" }]);
  });

  it("keeps the shot cleared when a sync change moves the row off its bird and back", async () => {
    variants = { b1: NIGHT_RUN, b2: NIGHT_RUN };
    await show();
    await tick("u2");
    birds = BIRDS.map((b) => (b.id === "b2" ? { ...b, canFly: false } : b));
    await act(async () => root?.render(page()));
    expect(row().pickedId).toBe("b1");
    expect(row().espresso?.ticked).toBe(false);
    birds = BIRDS;
    await act(async () => root?.render(page()));
    expect(row().pickedId).toBe("b2");
    expect(row().espresso?.ticked).toBe(false);
    expect(await releaseNow()).toEqual([{ friendId: "u2", birdId: "b2" }]);
  });

  it("keeps the shot cleared when new recipients move the row off its bird and back", async () => {
    friends = { status: 200, body: FOUR_FRIENDS };
    variants = { b1: NIGHT_RUN, b2: NIGHT_RUN };
    await show();
    expect(row().pickedId).toBe("b2");
    await tick("u2");
    await sendTo(["u2", "u3"]);
    expect(row().pickedId).toBe("b1");
    expect(row().espresso?.ticked).toBe(false);
    await sendTo("u2");
    expect(row().pickedId).toBe("b2");
    expect(row().espresso?.ticked).toBe(false);
    expect(await releaseNow()).toEqual([{ friendId: "u2", birdId: "b2" }]);
  });

  it("switches the stats to the espresso line when ticked", async () => {
    variants = { b2: NIGHT_RUN };
    await show();
    expect(row().stats?.forecast).toBe(
      "Lands around 11:20 am. Clear skies over Jersey.",
    );
    await tick("u2");
    expect(row().stats).toEqual({
      distance: "81 mi",
      flightTime: "9h 00m",
      odds: "77%",
      forecast: "Flies through the night (espresso). Lands around 6:32 pm.",
    });
  });

  it("spends the last shot on one row and disables it on the others", async () => {
    friends = { status: 200, body: FOUR_FRIENDS };
    seen.to = ["u2", "u3", "u4"];
    released = Promise.resolve({
      status: 201,
      body: { flights: [{ id: "f1" }, { id: "f2" }, { id: "f3" }] },
    });
    variants = { b1: NIGHT_RUN, b2: NIGHT_RUN };
    shotsHeld = 1;
    await show();
    expect(view().rows.map((r) => r.pickedId)).toEqual(["b4", "b2", "b1"]);
    await tick("u3");
    expect(view().rows.map((r) => r.espresso)).toEqual([
      null,
      {
        label: "Espresso shot · keep Crumbs up tonight",
        ticked: true,
        disabled: false,
      },
      {
        label: "Espresso shot · keep Gerald up tonight",
        ticked: false,
        disabled: true,
      },
    ]);
    expect(await releaseNow()).toEqual([
      { friendId: "u2", birdId: "b4" },
      { friendId: "u3", birdId: "b2", espresso: true },
      { friendId: "u4", birdId: "b1" },
    ]);
  });
});

describe("Compose page for a guest (ac-1, ac-2)", () => {
  const PIN = { lat: 40.712345678, lon: -74.006012345 };
  const LINK = "https://coo.test/g/abc";
  let pins: Map<string, string>;

  const releaseNote = async () => {
    await type("Dinner Saturday?");
    await act(async () => view().onRelease());
    return JSON.parse(String(flightCalls()[0][1]?.body));
  };

  beforeEach(() => {
    seen.to = null;
    seen.guest = { guest: "Maya", place: "p1" };
    pins = new Map();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => pins.get(k) ?? null,
    });
    released = Promise.resolve({
      status: 201,
      body: {
        flights: [{ id: "f1" }],
        guestLinks: [{ flightId: "f1", url: LINK }],
      },
    });
  });

  it("shows the guest with the quoted place and the fastest ready bird", async () => {
    await show();
    expect(view().rows).toEqual([
      {
        id: "p1",
        recipient: { name: "Maya", line: "Fishtown, Philadelphia" },
        pickedId: "b2",
        tooLong: false,
        stats: expect.objectContaining({ distance: "81 mi", odds: "81%" }),
        forecastHref: null,
        espresso: null,
      },
    ]);
    expect(releaseLabel()).toBe("Crumbs");
  });

  it("leaves the place line empty until the quote arrives", async () => {
    quoted = () => new Promise(() => {});
    await show();
    expect(row().recipient).toEqual({ name: "Maya", line: "" });
    expect(row().stats).toBeNull();
  });

  it("quotes the place without a pin when none is stored", async () => {
    await show();
    expect(quoteBodies()).toEqual([
      { recipients: [{ place: { placeId: "p1" } }], birdIds: ["b2"] },
    ]);
  });

  it("releases to the guest without a pin and moves on to the takeoff", async () => {
    await show();
    expect(await releaseNote()).toEqual({
      body: "Dinner Saturday?",
      sends: [{ guest: { name: "Maya", placeId: "p1" }, birdId: "b2" }],
    });
    expect(seen.push).toHaveBeenCalledExactlyOnceWith("/send/takeoff/f1");
    expect(seen.toast).not.toHaveBeenCalled();
  });

  it("quotes and releases with the exact stored pin and keeps it out of every URL", async () => {
    pins.set(pinKey("p1"), JSON.stringify(PIN));
    await show();
    expect(quoteBodies()).toEqual([
      { recipients: [{ place: { placeId: "p1", pin: PIN } }], birdIds: ["b2"] },
    ]);
    expect(await releaseNote()).toEqual({
      body: "Dinner Saturday?",
      sends: [
        { guest: { name: "Maya", placeId: "p1", pin: PIN }, birdId: "b2" },
      ],
    });
    const urls = [
      ...seen.push.mock.calls.flat().map(String),
      ...fetchMock.mock.calls.map(([url]) => String(url)),
      ...view().rows.map((r) => String(r.forecastHref)),
    ];
    expect(urls).toContain("/send/takeoff/f1");
    for (const url of urls) {
      expect(url).not.toContain("40.71");
      expect(url).not.toContain("74.00");
    }
  });

  it("holds the guest's link for the takeoff", async () => {
    await show();
    await releaseNote();
    expect(takeLink("f1")).toBe(LINK);
  });

  it("quotes and releases the picked bird", async () => {
    await show();
    await pick("b1");
    expect(row().pickedId).toBe("b1");
    expect(quoteBodies().at(-1)).toEqual({
      recipients: [{ place: { placeId: "p1" } }],
      birdIds: ["b1"],
    });
    expect((await releaseNote()).sends).toEqual([
      { guest: { name: "Maya", placeId: "p1" }, birdId: "b1" },
    ]);
  });

  it("does not ask for the friends", async () => {
    friends = {
      status: 500,
      body: { error: { code: "internal", message: "Friends unavailable" } },
    };
    await show();
    expect(row().recipient.name).toBe("Maya");
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url) === "/api/friends"),
    ).toEqual([]);
  });

  it("writes no forecast draft for the guest", async () => {
    await show();
    await releaseNote();
    expect(seen.drafts.size).toBe(0);
  });

  it("sends to the guest without a pin when storage is blocked", async () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
    });
    await show();
    expect(quoteBodies()).toEqual([
      { recipients: [{ place: { placeId: "p1" } }], birdIds: ["b2"] },
    ]);
  });

  it("composes for the friends in ?to= over the guest", async () => {
    seen.to = "u2";
    await show();
    expect(view().rows.map((r) => [r.id, r.recipient.name])).toEqual([
      ["u2", "Priya"],
    ]);
  });

  const visit = (params: { to?: string; guest?: Record<string, string> }) => {
    seen.to = params.to ?? null;
    seen.guest = params.guest ?? {};
    return act(async () => root?.render(page()));
  };

  it("follows the link to a new guest, place and pin", async () => {
    const ALEX_PIN = { lat: 41.9, lon: -87.6 };
    pins.set(pinKey("p1"), JSON.stringify(PIN));
    pins.set(pinKey("p2"), JSON.stringify(ALEX_PIN));
    await show();
    await pick("b1");
    await visit({ guest: { guest: "Alex", place: "p2" } });
    expect(row()).toMatchObject({
      id: "p2",
      recipient: { name: "Alex" },
      pickedId: "b2",
    });
    expect(quoteBodies().at(-1)).toEqual({
      recipients: [{ place: { placeId: "p2", pin: ALEX_PIN } }],
      birdIds: ["b2"],
    });
    expect((await releaseNote()).sends).toEqual([
      {
        guest: { name: "Alex", placeId: "p2", pin: ALEX_PIN },
        birdId: "b2",
      },
    ]);
  });

  it("drops the old guest's pin when the new place has none", async () => {
    pins.set(pinKey("p1"), JSON.stringify(PIN));
    await show();
    await visit({ guest: { guest: "Alex", place: "p2" } });
    expect(quoteBodies().at(-1)).toEqual({
      recipients: [{ place: { placeId: "p2" } }],
      birdIds: ["b2"],
    });
    expect((await releaseNote()).sends).toEqual([
      { guest: { name: "Alex", placeId: "p2" }, birdId: "b2" },
    ]);
  });

  it("follows the link from a friend to a guest", async () => {
    seen.to = "u2";
    seen.guest = {};
    await show();
    expect(row().recipient.name).toBe("Priya");
    await visit({ guest: { guest: "Maya", place: "p1" } });
    expect(seen.missing).toBeNull();
    expect(row()).toMatchObject({ id: "p1", recipient: { name: "Maya" } });
    expect((await releaseNote()).sends).toEqual([
      { guest: { name: "Maya", placeId: "p1" }, birdId: "b2" },
    ]);
  });

  it("follows the link from a guest to a friend", async () => {
    await show();
    await visit({ to: "u2" });
    expect(row()).toMatchObject({ id: "u2", recipient: { name: "Priya" } });
    expect((await releaseNote()).sends).toEqual([
      { friendId: "u2", birdId: "b2" },
    ]);
  });

  it("says so when the guest has no place", async () => {
    seen.guest = { guest: "Maya" };
    await show();
    expect(seen.view).toBeNull();
    expect(seen.missing).toBe("That friend is not in your address book.");
  });
});
