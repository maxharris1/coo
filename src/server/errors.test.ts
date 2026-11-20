import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AppError,
  ERROR_STATUS,
  toErrorResponse,
  type ErrorCode,
} from "./errors";
import { log } from "./log";

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

  const internal = (requestId: string) => ({
    status: 500,
    body: {
      error: {
        code: "internal",
        message: `Something went wrong (ref ${requestId})`,
      },
    },
  });

  it("passes an AppError through with its status and message", () => {
    const logged = vi.spyOn(log, "error").mockImplementation(() => {});
    expect(
      toErrorResponse(new AppError("conflict", "bird not home"), "r1"),
    ).toEqual({
      status: 409,
      body: { error: { code: "conflict", message: "bird not home" } },
    });
    expect(logged).not.toHaveBeenCalled();
  });

  it("hides a plain Error behind a referenced internal message and logs only the request id", () => {
    const logged = vi.spyOn(log, "error").mockImplementation(() => {});
    const res = toErrorResponse(new Error("secret detail"), "r2");
    expect(res).toEqual(internal("r2"));
    expect(logged).toHaveBeenCalledOnce();
    expect(logged).toHaveBeenCalledWith("http.internal", {
      requestId: "r2",
    });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("secret detail");
  });

  it("treats a thrown string as internal without logging it", () => {
    const logged = vi.spyOn(log, "error").mockImplementation(() => {});
    const res = toErrorResponse("boom", "r3");
    expect(res).toEqual(internal("r3"));
    expect(JSON.stringify(logged.mock.calls)).not.toContain("boom");
  });

  it.each<[string, () => unknown]>([
    ["an object with toString null", () => ({ toString: null })],
    ["a null-prototype object", () => Object.create(null)],
    [
      "an object with a non-callable toString",
      () => ({ toString: "upstream field", message: "private" }),
    ],
    [
      "an Error whose message getter throws",
      () =>
        Object.defineProperty(new Error(), "message", {
          get() {
            throw new Error("getter");
          },
        }),
    ],
    [
      "a proxy whose prototype lookup throws",
      () =>
        new Proxy(
          {},
          {
            getPrototypeOf() {
              throw new Error("trap");
            },
          },
        ),
    ],
  ])("treats %s as internal", (_name, make) => {
    const logged = vi.spyOn(log, "error").mockImplementation(() => {});
    expect(toErrorResponse(make(), "r4")).toEqual(internal("r4"));
    expect(logged).toHaveBeenCalledWith("http.internal", {
      requestId: "r4",
    });
  });
});
