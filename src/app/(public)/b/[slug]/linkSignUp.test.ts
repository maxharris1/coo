import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { E164 } from "@/lib/phone";
import { afterSignIn } from "../../join/returnTo";
import {
  finishLinkSignUp,
  forgetLink,
  linkRoost,
  pendingLink,
  rememberLink,
} from "./linkSignUp";

const TOKEN = "AbCdEfGhIjKl";
const LINK = { token: TOKEN, name: "Maya", phone: "+15550100199" as E164 };
const MINUTE = 60_000;

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  });
  vi.stubGlobal("document", { cookie: "" });
});
afterEach(() => vi.unstubAllGlobals());

const json = (status: number, body: unknown) =>
  (async () =>
    new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

describe("signing up from a guest link", () => {
  it("remembers the link, the name and the phone for 30 minutes", () => {
    rememberLink(LINK, 0);
    expect(pendingLink(29 * MINUTE)).toEqual(LINK);
    expect(pendingLink(31 * MINUTE)).toBeNull();
  });

  it("forgets the link", () => {
    rememberLink(LINK, 0);
    forgetLink();
    expect(pendingLink(0)).toBeNull();
  });

  it("refuses anything that is not a link token", () => {
    for (const token of ["../api", "//evil.com", "a/b", "a-b", ""]) {
      rememberLink({ ...LINK, token }, 0);
      expect(pendingLink(0), token).toBeNull();
    }
  });

  it("ignores a planted or broken entry", () => {
    store.set("coo_link", "{not json");
    expect(pendingLink(0)).toBeNull();
  });

  it("sends a new user straight to the first bird, past install", () => {
    rememberLink(LINK);
    expect(afterSignIn("/welcome/install")).toBe("/welcome/bird");
    expect(pendingLink()).toEqual(LINK);
  });

  it("sends a returning user back to the link to add it to the sill", () => {
    rememberLink(LINK);
    expect(afterSignIn("/")).toBe(`/b/${TOKEN}`);
    expect(pendingLink()).toBeNull();
  });

  it("prefills the loft with the link's destination", async () => {
    const fetchImpl = json(200, {
      flight: { to: { lat: 39.95, lon: -75.16, label: "Philadelphia" } },
    });
    expect(await linkRoost(TOKEN, fetchImpl)).toEqual({
      lat: 39.95,
      lon: -75.16,
      label: "Philadelphia",
      city: null,
    });
  });

  it("has no prefill when the link cannot be read", async () => {
    expect(await linkRoost(TOKEN, json(410, {}))).toBeNull();
  });

  it("claims after the loft and lands on Reply while the bird waits", async () => {
    rememberLink(LINK);
    const calls: string[] = [];
    const fetchImpl = (async (url: string) => {
      calls.push(url);
      return new Response(JSON.stringify({ visitId: "v1" }), { status: 200 });
    }) as unknown as typeof fetch;
    expect(await finishLinkSignUp(fetchImpl)).toBe("/sill/v1/reply");
    expect(calls).toEqual(["/api/guest/AbCdEfGhIjKl/claim"]);
    expect(pendingLink()).toBeNull();
  });

  it("has nothing to finish when no link is pending", async () => {
    expect(await finishLinkSignUp(json(500, {}))).toBeNull();
  });

  it("goes home when the claim is refused", async () => {
    rememberLink(LINK);
    expect(await finishLinkSignUp(json(410, {}))).toBe("/");
    expect(pendingLink()).toBeNull();
  });
});
