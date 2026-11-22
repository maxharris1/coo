import { act, StrictMode, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToastContext } from "@/components/Toasts";
import type { PlaceResult } from "../../welcome/loft/roost";
import { PREFILL_NAME_KEY } from "../recipients";
import type { NewRecipientView } from "./NewRecipientView";
import NewRecipientPage from "./page";

type ViewProps = ComponentProps<typeof NewRecipientView>;

const seen = vi.hoisted(() => ({ view: null as ViewProps | null }));

vi.mock("./NewRecipientView", () => ({
  NewRecipientView: (props: ViewProps) => {
    seen.view = props;
    return null;
  },
}));

const FISHTOWN: PlaceResult = {
  placeId: "p1",
  label: "Fishtown, Philadelphia",
  sublabel: "Philadelphia, PA",
  kind: "neighbourhood",
};
const PHILLY: PlaceResult = {
  placeId: "p2",
  label: "Philadelphia, PA",
  sublabel: "Pennsylvania",
  kind: "city",
};

let stored: Map<string, string>;
let answer: (q: string) => Promise<Response>;
let fetchMock: ReturnType<
  typeof vi.fn<(url: RequestInfo | URL) => Promise<Response>>
>;
let toast: ReturnType<typeof vi.fn<(message: string) => void>>;
let root: Root | null;

const view = () => seen.view!;

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
      <StrictMode>
        <ToastContext.Provider value={toast}>
          <NewRecipientPage />
        </ToastContext.Provider>
      </StrictMode>,
    ),
  );
}

const unmount = async () => {
  const r = root;
  root = null;
  await act(async () => r?.unmount());
};

const tick = (ms: number) =>
  act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

const type = (q: string) => act(async () => view().onQuery(q));

const searched = () =>
  fetchMock.mock.calls.map(([url]) =>
    new URL(String(url), "http://x").searchParams.get("q"),
  );

beforeEach(() => {
  vi.useFakeTimers();
  seen.view = null;
  root = null;
  stored = new Map();
  toast = vi.fn<(message: string) => void>();
  answer = () =>
    Promise.resolve(Response.json({ results: [FISHTOWN, PHILLY] }));
  fetchMock = vi.fn((url: RequestInfo | URL) =>
    answer(new URL(String(url), "http://x").searchParams.get("q") ?? ""),
  );
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { HTMLIFrameElement: class {} }),
  );
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => void stored.set(k, v),
    removeItem: (k: string) => void stored.delete(k),
  });
});

afterEach(async () => {
  await unmount();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("NewRecipient page prefill (ac-4)", () => {
  it("prefills the name handed off from the contact picker, then forgets it", async () => {
    stored.set(PREFILL_NAME_KEY, "Maya Okafor");
    await show();
    expect(view().name).toBe("Maya Okafor");
    expect(stored.has(PREFILL_NAME_KEY)).toBe(false);

    await unmount();
    await show();
    expect(view().name).toBe("");
  });

  it("leaves the handed-off name for the browser when rendered on the server", () => {
    stored.set(PREFILL_NAME_KEY, "Maya Okafor");
    const html = renderToStaticMarkup(
      <ToastContext.Provider value={toast}>
        <NewRecipientPage />
      </ToastContext.Provider>,
    );
    expect(html).toContain('aria-busy="true"');
    expect(seen.view).toBeNull();
    expect(stored.get(PREFILL_NAME_KEY)).toBe("Maya Okafor");
  });

  it("starts with an empty name and lets the sender type one", async () => {
    await show();
    expect(view().name).toBe("");
    await act(async () => view().onName("Maya"));
    expect(view().name).toBe("Maya");
  });
});

describe("NewRecipient page search", () => {
  it("searches once the typing settles and shows the places", async () => {
    await show();
    await type("F");
    await type("Fi");
    await type("Fish");
    expect(view().search).toEqual({ kind: "loading", query: "Fish" });
    await tick(299);
    expect(searched()).toEqual([]);
    await tick(1);
    expect(searched()).toEqual(["Fish"]);
    expect(view().search).toEqual({
      kind: "results",
      query: "Fish",
      results: [FISHTOWN, PHILLY],
    });
  });

  it("picking a place fills the field and readies Next without searching again", async () => {
    await show();
    await act(async () => view().onName("Maya"));
    await type("Fish");
    await tick(300);
    await act(async () => view().onPick(FISHTOWN));
    expect(view().pickedId).toBe("p1");
    expect(view().query).toBe("Fishtown, Philadelphia");
    expect(view().search).toMatchObject({
      kind: "results",
      results: [FISHTOWN, PHILLY],
    });
    await tick(1000);
    expect(searched()).toEqual(["Fish"]);
  });

  it("drops the pick once the sender edits the place", async () => {
    await show();
    await type("Fish");
    await tick(300);
    await act(async () => view().onPick(FISHTOWN));
    await type("Fishtown, Phila");
    expect(view().pickedId).toBeNull();
  });

  it("ignores an answer that arrives after the query moved on", async () => {
    const late: Record<string, (r: Response) => void> = {};
    answer = (q) => new Promise((resolve) => (late[q] = resolve));
    await show();
    await type("Fish");
    await tick(300);
    await type("Phil");
    await tick(300);
    await act(async () => late.Phil(Response.json({ results: [PHILLY] })));
    await act(async () => late.Fish(Response.json({ results: [FISHTOWN] })));
    expect(view().search).toEqual({
      kind: "results",
      query: "Phil",
      results: [PHILLY],
    });
  });

  it("toasts the reason and shows the failed state when the search fails", async () => {
    answer = () =>
      Promise.resolve(
        Response.json(
          {
            error: { message: "That is a lot of pigeons. Try again in a bit." },
          },
          { status: 429 },
        ),
      );
    await show();
    await type("Fish");
    await tick(300);
    expect(toast).toHaveBeenCalledExactlyOnceWith(
      "That is a lot of pigeons. Try again in a bit.",
    );
    expect(view().search).toEqual({ kind: "failed", query: "Fish" });
  });

  it("goes back to idle when the field is cleared", async () => {
    await show();
    await type("Fish");
    await type("");
    await tick(1000);
    expect(view().search).toEqual({ kind: "idle" });
    expect(searched()).toEqual([]);
  });
});
