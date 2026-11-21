import { act, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncContext, type SyncState } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import type { Flight } from "@/server/services/flights/shape";
import { DevPanel } from "./DevPanel";

const view = vi.hoisted(() => ({ tree: null as ReactNode }));

vi.mock("./DevPanelView", async (actual) => {
  const real = await actual<typeof import("./DevPanelView")>();
  return {
    DevPanelView: (props: Parameters<typeof real.DevPanelView>[0]) => {
      view.tree = real.DevPanelView(props);
      return null;
    },
  };
});

type Props = {
  children?: ReactNode;
  disabled?: boolean;
  role?: string;
  dateTime?: string;
  onClick?: () => void;
};

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const NOW = Date.parse("2026-11-21T09:00:00Z");

const flight = (
  id: string,
  arriveAt: number,
  over: Partial<Flight> = {},
): Flight =>
  ({
    id,
    kind: "delivery",
    status: "flying",
    role: "mine",
    releaseAt: NOW,
    arriveAt,
    ...over,
  }) as Flight;

const FLYING = [
  flight("b1c2d3e4-0000-4000-8000-000000000002", NOW + 90 * 60_000),
  flight("b1c2d3e4-0000-4000-8000-000000000001", NOW + 30 * 60_000, {
    role: "incoming",
  }),
];

const elements = (node: ReactNode): ReactElement<Props>[] => {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as ReactElement<Props>;
  return [el, ...elements(el.props.children)];
};

const buttons = () => elements(view.tree).filter((el) => el.type === "button");
const button = (label: string) => {
  const found = buttons().find((el) => el.props.children === label);
  if (!found) throw new Error(`no button labelled ${label}`);
  return found;
};
const alert = () =>
  elements(view.tree).find((el) => el.props.role === "alert")?.props.children;

let root: Root;
let refresh: ReturnType<typeof vi.fn<() => void>>;
let fetchMock: ReturnType<typeof vi.fn<typeof fetch>>;

const posts = () =>
  fetchMock.mock.calls.map(([url, init]) => ({
    url: String(url),
    method: init?.method,
    body: JSON.parse(String(init?.body)) as Record<string, unknown>,
  }));

async function mount(flights: Flight[] | null) {
  const sync: SyncState = {
    data: flights && ({ serverNow: NOW, flights } as unknown as SyncPayload),
    error: null,
    offsetMs: 0,
    refresh,
  };
  await act(async () =>
    root.render(
      <SyncContext.Provider value={sync}>
        <DevPanel />
      </SyncContext.Provider>,
    ),
  );
}

async function click(label: string) {
  await act(async () => button(label).props.onClick!());
}

beforeEach(() => {
  view.tree = null;
  refresh = vi.fn<() => void>();
  fetchMock = vi.fn<typeof fetch>(async () => Response.json({ ok: true }));
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { HTMLIFrameElement: class {} }),
  );
  const container = Object.assign(new EventTarget(), {
    nodeType: 1,
    tagName: "DIV",
    ownerDocument: new EventTarget(),
  }) as unknown as Element;
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

describe("DevPanel buttons (ac-2, ac-3)", () => {
  it.each([
    ["+10 min", "/api/dev/clock", { addMs: 600_000 }],
    ["+1 hour", "/api/dev/clock", { addMs: 3_600_000 }],
    ["+1 day", "/api/dev/clock", { addMs: 86_400_000 }],
    ["Reset clock", "/api/dev/clock", { reset: true }],
    ["+500 seeds", "/api/dev/grant", { seeds: 500 }],
    [
      "Jump to next landing",
      "/api/dev/clock",
      { toFlight: "b1c2d3e4-0000-4000-8000-000000000001" },
    ],
  ])("%s posts to %s and then refreshes", async (label, url, body) => {
    await mount(FLYING);
    await click(label);
    expect(posts()).toEqual([
      {
        url,
        method: "POST",
        body: { ...body, ref: expect.stringMatching(UUID) },
      },
    ]);
    expect(refresh).toHaveBeenCalledOnce();
    expect(alert()).toBeUndefined();
  });

  it("sends a fresh ref for each operation", async () => {
    await mount(FLYING);
    await click("+1 hour");
    await click("+1 hour");
    const [first, second] = posts();
    expect(first.body.ref).not.toBe(second.body.ref);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("runs the tick by refreshing without posting", async () => {
    await mount(FLYING);
    await click("Run tick");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("disables Jump to next landing when no delivery is flying", async () => {
    await mount([
      flight("landed", NOW, { status: "landed" }),
      flight("return", NOW + 60_000, { kind: "return" }),
    ]);
    expect(button("Jump to next landing").props.disabled).toBe(true);
    expect(button("+1 hour").props.disabled).toBe(false);
  });

  it("disables Jump to next landing before the first sync", async () => {
    await mount(null);
    expect(button("Jump to next landing").props.disabled).toBe(true);
  });

  it("shows the server time from the sync payload", async () => {
    await mount(FLYING);
    const time = elements(view.tree).find((el) => el.type === "time");
    expect(time?.props.dateTime).toBe(new Date(NOW).toISOString());
  });

  it("disables every button while a post is in flight", async () => {
    let answer: (res: Response) => void = () => {};
    fetchMock.mockImplementationOnce(
      () => new Promise<Response>((resolve) => (answer = resolve)),
    );
    await mount(FLYING);
    await click("+1 day");
    expect(buttons().every((el) => el.props.disabled)).toBe(true);
    await act(async () => answer(Response.json({ ok: true })));
    expect(button("+1 day").props.disabled).toBe(false);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("shows a failed post's message and refreshes", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json(
        { error: { message: "Could not find that flight." } },
        { status: 404 },
      ),
    );
    await mount(FLYING);
    await click("Jump to next landing");
    expect(alert()).toBe("Could not find that flight.");
    expect(refresh).toHaveBeenCalledOnce();
    expect(button("+1 hour").props.disabled).toBe(false);

    await click("+1 hour");
    expect(alert()).toBeUndefined();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("shows a calm message when the network fails", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    await mount(FLYING);
    await click("+500 seeds");
    expect(alert()).toBe("We could not reach the loft. Try again.");
    expect(refresh).toHaveBeenCalledOnce();
  });
});

describe("DevPanel retries (ac-2)", () => {
  const LABELS = [
    "+10 min",
    "+1 hour",
    "+1 day",
    "Jump to next landing",
    "Reset clock",
    "+500 seeds",
  ];
  const FAILURES: [string, () => Promise<Response>][] = [
    ["a 500", async () => Response.json({}, { status: 500 })],
    [
      "a network failure",
      async () => {
        throw new TypeError("offline");
      },
    ],
  ];

  describe.each(FAILURES)("after %s", (_, fail) => {
    it.each(LABELS)(
      "%s retries with the failed operation's ref",
      async (label) => {
        fetchMock.mockImplementationOnce(fail);
        await mount(FLYING);
        await click(label);
        await click(label);
        const [failed, retry] = posts();
        expect(retry).toEqual(failed);
        expect(retry.body.ref).toMatch(UUID);
        expect(alert()).toBeUndefined();

        await click(label);
        expect(posts()[2].body.ref).not.toBe(retry.body.ref);
      },
    );
  });

  it("gives a different operation after a failure its own ref", async () => {
    fetchMock.mockImplementationOnce(FAILURES[0][1]);
    await mount(FLYING);
    await click("+1 hour");
    await click("+1 day");
    await click("+1 hour");
    const [failed, other, again] = posts();
    expect(other.body.ref).not.toBe(failed.body.ref);
    expect(again.body.ref).not.toBe(failed.body.ref);
    expect(again.body.ref).not.toBe(other.body.ref);
  });

  it("keeps the ref across repeated failures of the same operation", async () => {
    fetchMock
      .mockImplementationOnce(FAILURES[0][1])
      .mockImplementationOnce(FAILURES[1][1]);
    await mount(FLYING);
    await click("Reset clock");
    await click("Reset clock");
    await click("Reset clock");
    expect(new Set(posts().map((p) => p.body.ref)).size).toBe(1);
  });
});
