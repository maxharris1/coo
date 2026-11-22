import { describe, expect, it } from "vitest";
import {
  initialRoommate,
  roommate,
  sendRoommate,
  submitRoommate,
  type RoommateAction,
  type RoommateState,
} from "./roommate";

const BRENDA = {
  id: "b2",
  name: "Brenda",
  pronoun: "she",
  breed: "city",
  look: "brenda",
};

const naming: Extract<RoommateState, { kind: "naming" }> = {
  kind: "naming",
  first: "Gerry",
  look: "brenda",
  name: "Brenda",
  pronoun: "they",
  edited: false,
  sending: false,
};

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { impl, calls };
}

describe("initialRoommate (ac-4)", () => {
  it("names the first bird and draws the next starter look", () => {
    expect(initialRoommate([{ name: "Gerry", look: "gerald" }], 2)).toEqual(
      naming,
    );
  });

  it("is not owed once the loft has its roommate", () => {
    expect(
      initialRoommate(
        [
          { name: "Gerry", look: "gerald" },
          { name: "Brenda", look: "brenda" },
        ],
        3,
      ),
    ).toEqual({ kind: "none" });
  });

  it("is not owed without a free perch", () => {
    expect(initialRoommate([{ name: "Gerry", look: "gerald" }], 1)).toEqual({
      kind: "none",
    });
  });

  it("is not owed before there is a first bird", () => {
    expect(initialRoommate([], 2)).toEqual({ kind: "none" });
  });
});

describe("initialRoommate prefilled name (ac-5)", () => {
  it("skips the first bird's name when the next look would reuse it", () => {
    const state = initialRoommate([{ name: "Gerald", look: "kevin" }], 2);
    expect(state).toMatchObject({ kind: "naming", look: "gerald" });
    expect(state.kind === "naming" && state.name).toBe("Brenda");
  });

  it("matches the first bird's name regardless of case and spaces", () => {
    const state = initialRoommate([{ name: " gerald ", look: "kevin" }], 2);
    expect(state.kind === "naming" && state.name).toBe("Brenda");
  });
});

describe("roommate reducer", () => {
  it("edits the name and pronoun", () => {
    let s = roommate(naming, { type: "name", name: "Mabel" });
    s = roommate(s, { type: "pronoun", pronoun: "she" });
    expect(s).toEqual({
      ...naming,
      name: "Mabel",
      pronoun: "she",
      edited: true,
    });
  });

  it("keeps what was typed when the API refuses", () => {
    const typed = roommate(naming, { type: "name", name: "Mabel" });
    const sent = roommate(typed, { type: "send" });
    expect(sent).toMatchObject({ sending: true });
    expect(roommate(sent, { type: "failed" })).toEqual(typed);
  });

  it("ignores edits when no roommate is owed", () => {
    const none: RoommateState = { kind: "none" };
    expect(roommate(none, { type: "name", name: "x" })).toBe(none);
  });
});

describe("roommate reducer sync (ac-4, ac-5)", () => {
  const gerry = { name: "Gerry", look: "gerald" };
  const sync = (flock: { name: string; look: string }[], perches: number) =>
    ({ type: "sync", flock, perches }) as const;

  it("drops the form once the roommate has moved in", () => {
    expect(
      roommate(naming, sync([gerry, { name: "Mabel", look: "brenda" }], 3)),
    ).toEqual({ kind: "none" });
  });

  it("opens the form once a perch frees up", () => {
    expect(roommate({ kind: "none" }, sync([gerry], 2))).toEqual(naming);
  });

  it("follows a renamed first bird and moves the default off its name", () => {
    const s = roommate(naming, sync([{ name: "Brenda", look: "gerald" }], 2));
    expect(s).toMatchObject({ kind: "naming", first: "Brenda", edited: false });
    expect(s.kind === "naming" && s.name).not.toBe("Brenda");
  });

  it("keeps a typed name and the chosen pronoun", () => {
    let s = roommate(naming, { type: "name", name: "Mabel" });
    s = roommate(s, { type: "pronoun", pronoun: "she" });
    expect(roommate(s, sync([{ name: "Gus", look: "gerald" }], 2))).toEqual({
      ...naming,
      first: "Gus",
      name: "Mabel",
      pronoun: "she",
      edited: true,
    });
  });
});

describe("submitRoommate (ac-4)", () => {
  it("posts the name and pronoun to /api/birds/roommate", async () => {
    const { impl, calls } = fakeFetch(200, { bird: BRENDA });
    const r = await submitRoommate({ name: "Brenda", pronoun: "she" }, impl);
    expect(r).toEqual({ ok: true });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/birds/roommate");
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      name: "Brenda",
      pronoun: "she",
    });
  });

  it("returns the API's conflict message", async () => {
    const { impl } = fakeFetch(409, {
      error: { code: "conflict", message: "Every perch is taken." },
    });
    const r = await submitRoommate({ name: "Brenda", pronoun: "she" }, impl);
    expect(r).toEqual({ ok: false, message: "Every perch is taken." });
  });

  it("falls back to the unreachable line when fetch throws", async () => {
    const impl = (async () => {
      throw new TypeError("offline");
    }) as typeof fetch;
    const r = await submitRoommate({ name: "Brenda", pronoun: "she" }, impl);
    expect(r).toEqual({
      ok: false,
      message: "We could not reach the loft. Try again.",
    });
  });
});

describe("sendRoommate (ac-4)", () => {
  async function run(status: number, body: unknown) {
    const { impl, calls } = fakeFetch(status, body);
    let state: RoommateState = { ...naming, name: " Mabel ", pronoun: "she" };
    const toasts: string[] = [];
    let adopted = 0;
    const dispatch = (a: RoommateAction) => {
      state = roommate(state, a);
    };
    await sendRoommate(
      state,
      dispatch,
      (m) => toasts.push(m),
      () => adopted++,
      impl,
    );
    return { state, toasts, adopted, calls };
  }

  it("sends the trimmed name and reports the adoption with no toast", async () => {
    const { toasts, adopted, calls } = await run(200, { bird: BRENDA });
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      name: "Mabel",
      pronoun: "she",
    });
    expect(toasts).toEqual([]);
    expect(adopted).toBe(1);
  });

  it("toasts a conflict and keeps the name and pronoun", async () => {
    const { state, toasts, adopted } = await run(409, {
      error: { code: "conflict", message: "You already have a roommate." },
    });
    expect(toasts).toEqual(["You already have a roommate."]);
    expect(adopted).toBe(0);
    expect(state).toEqual({
      ...naming,
      name: " Mabel ",
      pronoun: "she",
      sending: false,
    });
  });

  it("does nothing while a send is in flight", async () => {
    const { impl, calls } = fakeFetch(200, { bird: BRENDA });
    const actions: RoommateAction[] = [];
    await sendRoommate(
      { ...naming, sending: true },
      (a) => actions.push(a),
      () => {},
      () => {},
      impl,
    );
    expect(calls).toHaveLength(0);
    expect(actions).toEqual([]);
  });
});
