import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AppError,
  ERROR_STATUS,
  toErrorResponse,
  type ErrorCode,
} from "./errors";

const DOCS_06: [ErrorCode, number][] = [
  ["unauthenticated", 401],
  ["not_onboarded", 409],
  ["invalid", 400],
  ["not_found", 404],
  ["forbidden", 403],
  ["conflict", 409],
  ["insufficient_seeds", 402],
  ["rate_limited", 429],
  ["gone", 410],
  ["internal", 500],
];

describe("AppError", () => {
  it("covers exactly the docs/06 codes", () => {
    expect(Object.keys(ERROR_STATUS).sort()).toEqual(
      DOCS_06.map(([code]) => code).sort(),
    );
  });

  it.each(DOCS_06)("%s maps to %i", (code, status) => {
    const err = new AppError(code, "public text");
    expect(err).toBeInstanceOf(Error);
    expect(err).toMatchObject({ code, status, message: "public text" });
  });
});

describe("toErrorResponse", () => {
  afterEach(() => vi.restoreAllMocks());

  it("passes an AppError through with its status and message", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      toErrorResponse(new AppError("conflict", "bird not home"), "r1"),
    ).toEqual({
      status: 409,
      body: { error: { code: "conflict", message: "bird not home" } },
    });
    expect(log).not.toHaveBeenCalled();
  });

  it("hides a plain Error behind a generic internal message and logs it", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = toErrorResponse(new Error("secret detail"), "r2");
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("internal");
    expect(JSON.stringify(res)).not.toContain("secret detail");
    expect(log).toHaveBeenCalledWith("r2", "secret detail");
  });

  it("treats a thrown string as internal", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = toErrorResponse("boom", "r3");
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("internal");
    expect(JSON.stringify(res)).not.toContain("boom");
    expect(log).toHaveBeenCalledWith("r3", "boom");
  });
});
