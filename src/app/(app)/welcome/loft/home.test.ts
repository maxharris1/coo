import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialLoft } from "./roost";

const push = vi.hoisted(() => vi.fn());

vi.mock("react", async (actual) => ({
  ...(await actual<typeof import("react")>()),
  useReducer: () => [initialLoft(), () => {}],
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

  it("goes home when there is no invite", async () => {
    vi.stubGlobal("document", { cookie: "" });
    await home();
    expect(push).toHaveBeenCalledWith("/");
  });
});
