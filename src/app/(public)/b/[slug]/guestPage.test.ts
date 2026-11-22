import { describe, expect, it } from "vitest";
import { AppError } from "@/server/errors";
import type { GuestView } from "@/server/services/guestLinks/get";
import { loadGuestPage, tokenFromSlug } from "./guestPage";

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
