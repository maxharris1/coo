import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { E164 } from "@/lib/phone";
import { pendingLink, rememberLink } from "../b/[slug]/linkSignUp";
import { afterSignIn, rememberReturn, takeReturn } from "./returnTo";

const CODE = "priya-AbCdEfGhIj_-";

const LINK = {
  token: "AbCdEfGhIjKl",
  name: "Maya",
  phone: "+15550100199" as E164,
};

const jar = new Map<string, string>();
const session = new Map<string, string>();
const written: string[] = [];

const stubBrowser = (protocol = "http:") => {
  jar.clear();
  session.clear();
  written.length = 0;
  vi.stubGlobal("location", { protocol });
  vi.stubGlobal("sessionStorage", {
    getItem: (k: string) => session.get(k) ?? null,
    setItem: (k: string, v: string) => session.set(k, v),
    removeItem: (k: string) => session.delete(k),
  });
  vi.stubGlobal("document", {
    get cookie() {
      return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
    },
    set cookie(line: string) {
      written.push(line);
      const [pair, ...attrs] = line.split(";").map((part) => part.trim());
      const at = pair.indexOf("=");
      const name = pair.slice(0, at);
      if (attrs.some((attr) => /^max-age=0$/i.test(attr))) jar.delete(name);
      else jar.set(name, pair.slice(at + 1));
    },
  });
};

describe("returning to an invite after sign-in", () => {
  beforeEach(() => stubBrowser());
  afterEach(() => vi.unstubAllGlobals());

  it("brings a remembered invite back as its join path", () => {
    rememberReturn(CODE);
    expect(takeReturn()).toBe(`/join/${CODE}`);
  });

  it("forgets the invite once taken", () => {
    rememberReturn(CODE);
    takeReturn();
    expect(takeReturn()).toBeNull();
    expect(jar.has("coo_return")).toBe(false);
  });

  it("returns nothing when no invite was remembered", () => {
    jar.set("other", "1");
    expect(takeReturn()).toBeNull();
  });

  it("refuses to remember anything that is not an invite code", () => {
    for (const bad of [
      "/sign-in",
      "//evil.com",
      "https://evil.com/join/x",
      "a/b",
      "",
    ]) {
      rememberReturn(bad);
      expect(jar.has("coo_return"), bad).toBe(false);
    }
  });

  it("refuses and clears a planted cookie that is not an invite code", () => {
    for (const bad of [
      "/sign-in",
      "//evil.com",
      "https://evil.com/join/x",
      "a/b",
      "",
    ]) {
      jar.set("coo_return", bad);
      expect(takeReturn(), bad).toBeNull();
      expect(jar.has("coo_return"), bad).toBe(false);
    }
  });

  it("keeps the cookie short-lived and site-wide", () => {
    rememberReturn(CODE);
    expect(written.at(-1)).toMatch(/; Path=\/(;|$)/);
    expect(written.at(-1)).toMatch(/; Max-Age=1800(;|$)/);
    expect(written.at(-1)).toMatch(/; SameSite=Lax(;|$)/);
    expect(written.at(-1)).not.toContain("Secure");
  });

  it("marks the cookie Secure over https", () => {
    stubBrowser("https:");
    rememberReturn(CODE);
    expect(written.at(-1)).toMatch(/; Secure(;|$)/);
  });

  describe("afterSignIn", () => {
    it("sends a returning user back to the invite", () => {
      rememberReturn(CODE);
      expect(afterSignIn("/")).toBe(`/join/${CODE}`);
      expect(jar.has("coo_return")).toBe(false);
    });

    it("sends a new user to the first bird and keeps the invite for later", () => {
      rememberReturn(CODE);
      expect(afterSignIn("/welcome/install")).toBe("/welcome/bird");
      expect(takeReturn()).toBe(`/join/${CODE}`);
    });

    it("sends a new user with no invite or link to the first bird", () => {
      expect(afterSignIn("/welcome/install")).toBe("/welcome/bird");
    });

    it("returns to a newer invite over an abandoned guest signup", () => {
      rememberLink(LINK);
      rememberReturn(CODE);
      expect(afterSignIn("/")).toBe(`/join/${CODE}`);
      expect(pendingLink()).toBeNull();
    });

    it("sends a new user from a newer invite through full onboarding", () => {
      rememberLink(LINK);
      rememberReturn(CODE);
      expect(afterSignIn("/welcome/install")).toBe("/welcome/bird");
      expect(takeReturn()).toBe(`/join/${CODE}`);
    });

    it("returns to a newer guest link over an abandoned invite", () => {
      rememberReturn(CODE);
      rememberLink(LINK);
      expect(afterSignIn("/")).toBe(`/b/${LINK.token}`);
      expect(takeReturn()).toBeNull();
    });

    it("sends a returning user home when there is no invite", () => {
      expect(afterSignIn("/")).toBe("/");
    });
  });
});
