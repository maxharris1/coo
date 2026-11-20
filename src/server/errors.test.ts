import { describe, expect, it } from "vitest";
import { AppError, ERROR_STATUS, type ErrorCode } from "./errors";

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
