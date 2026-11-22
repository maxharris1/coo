import { describe, expect, it } from "vitest";
import { toE164, type E164 } from "@/lib/phone";
import { AppError } from "@/server/errors";
import type { UserId } from "@/server/ports/auth";
import type { GuestView } from "@/server/services/guestLinks/get";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps } from "@/test/deps";
import { FakeJar } from "@/test/fakes/jar";
import { isMember, loadGuestPage, tokenFromSlug } from "./guestPage";

const guest = { senderName: "Max" } as GuestView;

describe("tokenFromSlug", () => {
  it("takes the text after the last hyphen", () => {
    expect(tokenFromSlug("gerald-k3Hq9ZtB2mXw7PaL")).toBe("k3Hq9ZtB2mXw7PaL");
    expect(tokenFromSlug("sir-gerald-k3Hq9ZtB2mXw7PaL")).toBe(
      "k3Hq9ZtB2mXw7PaL",
    );
    expect(tokenFromSlug("k3Hq9ZtB2mXw7PaL")).toBe("k3Hq9ZtB2mXw7PaL");
    expect(tokenFromSlug("gerald-")).toBe("");
  });
});

describe("loadGuestPage", () => {
  it("reads the link with the token from the slug", async () => {
    const seen: string[] = [];
    const page = await loadGuestPage(async (token) => {
      seen.push(token);
      return guest;
    }, "gerald-k3Hq9ZtB2mXw7PaL");
    expect(seen).toEqual(["k3Hq9ZtB2mXw7PaL"]);
    expect(page).toEqual({ kind: "live", token: "k3Hq9ZtB2mXw7PaL", guest });
  });

  it("shows an expired link as expired", async () => {
    const page = await loadGuestPage(async () => {
      throw new AppError("gone", "This link has expired");
    }, "gerald-k3Hq9ZtB2mXw7PaL");
    expect(page).toEqual({ kind: "expired" });
  });

  it("shows a wrong, reported or missing link as missing", async () => {
    const page = await loadGuestPage(async () => {
      throw new AppError("not_found", "No bird is flying on that link");
    }, "gerald-nope");
    expect(page).toEqual({ kind: "missing" });
  });

  it("lets any other failure through", async () => {
    await expect(
      loadGuestPage(async () => {
        throw new AppError("rate_limited", "Slow down");
      }, "gerald-k3Hq9ZtB2mXw7PaL"),
    ).rejects.toMatchObject({ code: "rate_limited" });
  });
});

describe("isMember", () => {
  async function signedIn(number: string) {
    const deps = await makeTestDeps();
    const jar = new FakeJar();
    const id = await deps
      .auth(jar)
      .verifyCode(toE164(number) as E164, "000000");
    if (!id) throw new Error("test sign-in failed");
    return {
      deps,
      id: id as UserId,
      session: { auth: deps.auth(jar), db: deps.db },
    };
  }

  it("is false for someone signed out", async () => {
    const deps = await makeTestDeps();
    expect(
      await isMember({ auth: deps.auth(new FakeJar()), db: deps.db }),
    ).toBe(false);
  });

  it("is false for someone signed in who has not made a loft", async () => {
    const { session } = await signedIn("(555) 123-4567");
    expect(await isMember(session)).toBe(false);
  });

  it("is true for someone signed in with a loft", async () => {
    const { deps, id, session } = await signedIn("(555) 123-4567");
    await onboard(deps, id, {
      timezone: "America/New_York",
      bird: { name: "Gerald", look: "gerald", pronoun: "he" },
      name: "Rosa",
    });
    await deps.db.query(
      "update profiles set onboarded_at = to_timestamp($2 / 1000.0) where id = $1",
      [id, deps.clock.now()],
    );
    expect(await isMember(session)).toBe(true);
  });
});
