import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialLoft } from "./roost";

const push = vi.hoisted(() => vi.fn());

vi.mock("react", async (actual) => ({
  ...(await actual<typeof import("react")>()),
  useReducer: () => [initialLoft(), () => {}],
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
  beforeEach(() => push.mockReset());
  afterEach(() => vi.unstubAllGlobals());

  it("goes back to the invite the new user came from", async () => {
    vi.stubGlobal("document", { cookie: `coo_return=${CODE}` });
    await home();
    expect(push).toHaveBeenCalledWith(`/join/${CODE}`);
  });

  it("claims a pending guest link and goes where the claim lands", async () => {
    const store = new Map([
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
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      removeItem: (k: string) => store.delete(k),
    });
    vi.stubGlobal("document", { cookie: `coo_return=${CODE}` });
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify({ visitId: "v1" })),
    );
    await home();
    expect(push).toHaveBeenCalledWith("/sill/v1/reply");
  });

  it("goes home when there is no invite", async () => {
    vi.stubGlobal("document", { cookie: "" });
    await home();
    expect(push).toHaveBeenCalledWith("/");
  });
});
