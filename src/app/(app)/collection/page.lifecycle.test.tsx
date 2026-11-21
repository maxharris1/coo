import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Collection } from "@/server/services/collection";
import type { State } from "./CollectionView";
import CollectionPage from "./page";

const states: State[] = [];

vi.mock("./CollectionView", () => ({
  CollectionView: ({ state }: { state: State }) => {
    states.push(state);
    return null;
  },
}));

type Account = { id: string; earnedAt: number[] };

let signedIn: Account;
let store: Map<string, string>;
let escaped: unknown[];
let root: Root;

const body = (account: Account): Collection => ({
  account: account.id,
  postmarks: account.earnedAt.map((earnedAt, i) => ({
    city: `City ${i}`,
    region: null,
    country: "US",
    earnedAt,
  })),
  badges: [],
  birdsMet: 0,
});

const memoryStorage = () => ({
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => void store.set(key, value),
});

const domError = (name: string) =>
  Object.assign(new Error(`${name} from storage`), { name });

const last = () => states[states.length - 1];

const freshness = () => {
  const state = last();
  if (state?.kind !== "ready") throw new Error(`observed ${state?.kind}`);
  return state.postmarks.slots.flatMap((s) =>
    s.kind === "stamp" ? [s.fresh] : [],
  );
};

async function visit(account: Account) {
  signedIn = account;
  root = createRoot(
    Object.assign(new EventTarget(), {
      nodeType: 1,
      tagName: "DIV",
      ownerDocument: document,
    }) as unknown as Element,
  );
  await act(async () =>
    root.render(
      <StrictMode>
        <CollectionPage />
      </StrictMode>,
    ),
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  await act(async () => root.unmount());
}

const onEscape = (reason: unknown) => void escaped.push(reason);

beforeEach(() => {
  states.length = 0;
  store = new Map();
  escaped = [];
  process.on("unhandledRejection", onEscape);
  process.on("uncaughtException", onEscape);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { HTMLIFrameElement: class {} }),
  );
  vi.stubGlobal("document", new EventTarget());
  vi.stubGlobal("localStorage", memoryStorage());
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) !== "/api/collection") {
        throw new Error(`unexpected ${String(input)}`);
      }
      return Response.json(body(signedIn));
    }),
  );
});

afterEach(() => {
  process.off("unhandledRejection", onEscape);
  process.off("uncaughtException", onEscape);
  vi.unstubAllGlobals();
});

const A = (earnedAt: number[]): Account => ({ id: "account-a", earnedAt });
const B = (earnedAt: number[]): Account => ({ id: "account-b", earnedAt });

describe("/collection when storage is unavailable (f-1)", () => {
  it("still renders the collection when saving the seen mark throws QuotaExceededError", async () => {
    vi.stubGlobal("localStorage", {
      ...memoryStorage(),
      setItem: () => {
        throw domError("QuotaExceededError");
      },
    });
    await visit(A([1000]));
    expect(last()?.kind).toBe("ready");
    expect(escaped).toEqual([]);
  });

  it("still renders the collection, playing the stamp, when reading the seen mark throws SecurityError", async () => {
    vi.stubGlobal("localStorage", {
      ...memoryStorage(),
      getItem: () => {
        throw domError("SecurityError");
      },
    });
    await visit(A([1000]));
    expect(freshness()).toEqual([true]);
    expect(escaped).toEqual([]);
  });

  it("still renders the collection when touching localStorage at all throws SecurityError", async () => {
    const original = Object.getOwnPropertyDescriptor(
      globalThis,
      "localStorage",
    );
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get: () => {
        throw domError("SecurityError");
      },
    });
    try {
      await visit(A([1000]));
    } finally {
      if (original) Object.defineProperty(globalThis, "localStorage", original);
    }
    expect(freshness()).toEqual([true]);
    expect(escaped).toEqual([]);
  });
});

describe("/collection seen postmarks per account (f-2)", () => {
  it("plays a newly earned stamp for one account after another account visited", async () => {
    await visit(B([]));
    await visit(A([1000]));
    await visit(B([500]));
    expect(freshness()).toEqual([true]);
  });

  it("plays a newly earned stamp once for the same account, under StrictMode", async () => {
    await visit(A([]));
    await visit(A([1000]));
    expect(freshness()).toEqual([true]);
    await visit(A([1000]));
    expect(freshness()).toEqual([false]);
  });
});
