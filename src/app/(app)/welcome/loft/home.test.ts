import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialLoft } from "./roost";

const push = vi.hoisted(() => vi.fn());
const dispatch = vi.hoisted(() => vi.fn());

vi.mock("react", async (actual) => ({
  ...(await actual<typeof import("react")>()),
  useReducer: () => [initialLoft(), dispatch],
  useEffect: () => {},
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const { Loft } = await import("./Loft");

const CODE = "priya-AbCdEfGhIj_-";

const home = () =>
  (
    Loft() as ReactElement<{ actions: { home: () => Promise<void> } }>
  ).props.actions.home();

describe("finishing onboarding", () => {
  beforeEach(() => {
    push.mockReset();
    dispatch.mockReset();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("goes back to the invite the new user came from", async () => {
    vi.stubGlobal("document", { cookie: `coo_return=${CODE}` });
    await home();
    expect(push).toHaveBeenCalledWith(`/join/${CODE}`);
  });

  const pendingGuestLink = () =>
    new Map([
      [
        "coo_link",
        JSON.stringify({
          token: "AbCdEfGhIjKl",
          name: "Priya",
          phone: "+15550000077",
          at: Date.now(),
        }),
      ],
    ]);

  it("claims a pending guest link and goes where the claim lands", async () => {
    const store = pendingGuestLink();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      removeItem: (k: string) => store.delete(k),
    });
    vi.stubGlobal("document", { cookie: `coo_return=${CODE}` });
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(JSON.stringify({ friendId: "u1", visitId: "v1" })),
    );
    await home();
    expect(push).toHaveBeenCalledWith("/sill/v1/reply");
  });

  it("stays on the loft with the error when the claim cannot reach the server", async () => {
    const store = pendingGuestLink();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      removeItem: (k: string) => store.delete(k),
    });
    vi.stubGlobal("document", { cookie: "" });
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("Failed to fetch");
    });
    await home();
    expect(push).not.toHaveBeenCalled();
    expect(dispatch).toHaveBeenCalledWith({
      type: "failed",
      message: "We could not reach the loft. Try again.",
    });
    expect(store.has("coo_link")).toBe(true);
  });

  it("goes home when there is no invite", async () => {
    vi.stubGlobal("document", { cookie: "" });
    await home();
    expect(push).toHaveBeenCalledWith("/");
  });
});
