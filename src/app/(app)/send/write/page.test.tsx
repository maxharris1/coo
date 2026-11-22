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
  to: "u2" as string | string[] | null,
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
    new URLSearchParams([seen.to ?? []].flat().map((id) => ["to", id])),
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

type QuoteBody = { recipients: { friendId: string }[]; birdIds: string[] };

const legFor = (birdIds: string[], friendId = "u2") => ({
  recipient: { friendId },
  distanceMi: MILES[friendId],
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
let quoted: (body: QuoteBody) => Promise<{ status: number; body: unknown }>;
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

const sendTo = (friendId: string) => {
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

const pick = (id: string) => pickFor(row().friendId, id);

const releaseLabel = () =>
  view().birds.find((b) => b.id === row().pickedId)?.name ?? null;

beforeEach(() => {
  seen.view = null;
  seen.missing = null;
  seen.loading = false;
  seen.push.mockClear();
  seen.toast.mockClear();
  seen.to = "u2";
  seen.drafts.clear();
  fetchMock.mockClear();
  friends = { status: 200, body: { friends: [PRIYA], guestLinks: [] } };
  quoted = async ({ recipients, birdIds }) => ({
    status: 200,
    body: { recipients: recipients.map((r) => legFor(birdIds, r.friendId)) },
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
      rows: [
        {
          friendId: "u2",
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
      view().rows.map((r) => [r.friendId, r.recipient.name, r.pickedId]),
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
    expect(view().rows.map((r) => r.friendId)).toEqual(["u2"]);
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
