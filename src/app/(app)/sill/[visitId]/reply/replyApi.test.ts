import { describe, expect, it, vi } from "vitest";
import type { Flight } from "@/server/services/flights/shape";
import type { FriendRow } from "@/server/services/friends";
import { friendRow, postReply } from "./replyApi";

const FLIGHT = { id: "f1", kind: "return" } as Flight;

const fetcher = (res: Response | Error) =>
  vi.fn<typeof fetch>(() =>
    res instanceof Error ? Promise.reject(res) : Promise.resolve(res),
  );

describe("postReply (ac-1)", () => {
  it("posts the body to the visit's reply route and returns the flight", async () => {
    const f = fetcher(Response.json({ flight: FLIGHT }));
    expect(await postReply(f, "v 1", "Bread is secured.")).toEqual({
      ok: true,
      flight: FLIGHT,
    });
    const [url, init] = f.mock.calls[0];
    expect(url).toBe("/api/visits/v%201/reply");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toEqual({
      body: "Bread is secured.",
    });
  });

  it("passes the API's message through on an error", async () => {
    const f = fetcher(
      Response.json(
        { error: { code: "conflict", message: "The visit is over." } },
        { status: 409 },
      ),
    );
    expect(await postReply(f, "v1", "hi")).toEqual({
      ok: false,
      message: "The visit is over.",
    });
  });

  it("says the loft is unreachable when the network fails", async () => {
    expect(await postReply(fetcher(new Error("offline")), "v1", "hi")).toEqual({
      ok: false,
      message: "We could not reach the loft. Try again.",
    });
  });

  it("treats a reply without a flight as unreachable", async () => {
    expect(await postReply(fetcher(Response.json({})), "v1", "hi")).toEqual({
      ok: false,
      message: "We could not reach the loft. Try again.",
    });
  });
});

describe("friendRow (ac-1)", () => {
  it("finds the owner in the friend list", async () => {
    const priya = { id: "u1", name: "Priya" } as FriendRow;
    const f = fetcher(Response.json({ friends: [priya], guestLinks: [] }));
    expect(await friendRow(f, "u1")).toEqual(priya);
    expect(await friendRow(f, "u2")).toBeUndefined();
    expect(f.mock.calls[0][0]).toBe("/api/friends");
  });

  it("gives up quietly when the list cannot load", async () => {
    expect(
      await friendRow(fetcher(new Error("offline")), "u1"),
    ).toBeUndefined();
  });
});
