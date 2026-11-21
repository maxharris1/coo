import { describe, expect, it } from "vitest";
import {
  breedCard,
  hatch,
  initialHatch,
  sendHatch,
  submitHatch,
  type HatchAction,
  type HatchState,
  type HatchedBird,
} from "./hatch";

const PRETZEL: HatchedBird = {
  id: "b1",
  name: "Pretzel",
  pronoun: "she",
  breed: "fantail",
  look: "gerald",
};

function fakeFetch(status: number, body: unknown) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const impl = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { impl, calls };
}

describe("submitHatch (ac-1)", () => {
  it("posts the name and pronoun to /api/eggs/hatch and returns the bird", async () => {
    const { impl, calls } = fakeFetch(200, { bird: PRETZEL, egg: null });
    const r = await submitHatch({ name: "Pretzel", pronoun: "she" }, impl);
    expect(r).toEqual({ ok: true, bird: PRETZEL });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/eggs/hatch");
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      name: "Pretzel",
      pronoun: "she",
    });
  });
});

describe("submitHatch failures (ac-2)", () => {
  it("returns the API's conflict message", async () => {
    const { impl } = fakeFetch(409, {
      error: { code: "conflict", message: "No free perch. The egg can wait." },
    });
    const r = await submitHatch({ name: "Pretzel", pronoun: "she" }, impl);
    expect(r).toEqual({
      ok: false,
      message: "No free perch. The egg can wait.",
    });
  });

  it("falls back to the unreachable line when fetch throws", async () => {
    const impl = (async () => {
      throw new TypeError("offline");
    }) as typeof fetch;
    const r = await submitHatch({ name: "Pretzel", pronoun: "she" }, impl);
    expect(r).toEqual({
      ok: false,
      message: "We could not reach the loft. Try again.",
    });
  });
});

describe("hatch reducer", () => {
  const typed = (): HatchState => {
    let s = hatch(initialHatch, { type: "name", name: "Pretzel" });
    s = hatch(s, { type: "pronoun", pronoun: "she" });
    return s;
  };

  it("starts empty with they/them and nothing sending", () => {
    expect(initialHatch).toEqual({
      kind: "naming",
      name: "",
      pronoun: "they",
      sending: false,
    });
  });

  it("keeps what was typed when the API refuses (ac-2)", () => {
    const sent = hatch(typed(), { type: "send" });
    expect(sent).toMatchObject({ kind: "naming", sending: true });
    expect(hatch(sent, { type: "failed" })).toEqual({
      kind: "naming",
      name: "Pretzel",
      pronoun: "she",
      sending: false,
    });
  });

  it("moves to hatched with the new bird (ac-1)", () => {
    const sent = hatch(typed(), { type: "send" });
    expect(hatch(sent, { type: "hatched", bird: PRETZEL })).toEqual({
      kind: "hatched",
      bird: PRETZEL,
    });
  });

  it("ignores edits once hatched", () => {
    const done: HatchState = { kind: "hatched", bird: PRETZEL };
    expect(hatch(done, { type: "name", name: "x" })).toBe(done);
  });
});

describe("breedCard", () => {
  it("reads the breed's name, note and trait from config", () => {
    expect(breedCard("fantail")).toEqual({
      name: "Fantail",
      note: "Slow, gorgeous, knows it.",
      trait: "Friends tip double",
    });
  });
});

describe("sendHatch (ac-2)", () => {
  async function run(status: number, body: unknown) {
    const { impl, calls } = fakeFetch(status, body);
    let state: HatchState = {
      kind: "naming",
      name: " Pretzel ",
      pronoun: "she",
      sending: false,
    };
    const toasts: string[] = [];
    const dispatch = (a: HatchAction) => {
      state = hatch(state, a);
    };
    await sendHatch(state, dispatch, (m) => toasts.push(m), impl);
    return { state, toasts, calls };
  }

  it("toasts a conflict and keeps the name and pronoun", async () => {
    const { state, toasts, calls } = await run(409, {
      error: { code: "conflict", message: "That egg is not ready to hatch." },
    });
    expect(toasts).toEqual(["That egg is not ready to hatch."]);
    expect(state).toEqual({
      kind: "naming",
      name: " Pretzel ",
      pronoun: "she",
      sending: false,
    });
    expect(JSON.parse(String(calls[0].init?.body)).name).toBe("Pretzel");
  });

  it("shows the hatched bird on success with no toast (ac-1)", async () => {
    const { state, toasts } = await run(200, { bird: PRETZEL, egg: null });
    expect(toasts).toEqual([]);
    expect(state).toEqual({ kind: "hatched", bird: PRETZEL });
  });

  it("does nothing while a send is in flight", async () => {
    const { impl, calls } = fakeFetch(200, { bird: PRETZEL, egg: null });
    const actions: HatchAction[] = [];
    await sendHatch(
      { kind: "naming", name: "Pretzel", pronoun: "she", sending: true },
      (a) => actions.push(a),
      () => {},
      impl,
    );
    expect(calls).toHaveLength(0);
    expect(actions).toEqual([]);
  });
});
