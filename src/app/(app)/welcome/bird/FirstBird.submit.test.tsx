import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { firstBird, initialFirstBird, type FirstBirdAction } from "./choices";
import { FirstBird } from "./FirstBird";

const push = vi.fn();
const dispatched: FirstBirdAction[] = [];
const state = firstBird(
  firstBird(initialFirstBird(), { type: "rename", name: "Gerry" }),
  { type: "yourName", name: "Max" },
);

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("react", async (original) => ({
  ...(await original<typeof import("react")>()),
  useEffect: () => {},
  useReducer: () => [state, (a: FirstBirdAction) => dispatched.push(a)],
}));

const adopt = () =>
  (
    FirstBird() as ReactElement<{ onSubmit: () => Promise<void> }>
  ).props.onSubmit();

afterEach(() => {
  vi.unstubAllGlobals();
  push.mockClear();
  dispatched.length = 0;
});

describe("Adopt on /welcome/bird (ac-1)", () => {
  it("posts you and the first bird with no roommate, then goes to the loft", async () => {
    const posts: { url: string; body: unknown }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      posts.push({ url, body: JSON.parse(String(init.body)) });
      return Response.json({ me: {}, birds: [] });
    });

    await adopt();

    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe("/api/onboarding");
    expect(posts[0].body).toMatchObject({
      name: "Max",
      bird: { name: "Gerry", look: "gerald", pronoun: "they" },
    });
    expect(posts[0].body).not.toHaveProperty("secondBird");
    expect(dispatched).toEqual([{ type: "send" }]);
    expect(push).toHaveBeenCalledExactlyOnceWith("/welcome/loft");
  });

  it("stays on the page and shows the error when the API refuses", async () => {
    vi.stubGlobal("fetch", async () =>
      Response.json(
        { error: { message: "That name is not allowed" } },
        { status: 400 },
      ),
    );

    await adopt();

    expect(dispatched).toEqual([
      { type: "send" },
      { type: "failed", message: "That name is not allowed" },
    ]);
    expect(push).not.toHaveBeenCalled();
  });
});
