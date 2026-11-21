import { afterEach, describe, expect, it, vi } from "vitest";
import DevLayout from "./layout";

afterEach(() => {
  vi.unstubAllEnvs();
});

function digestOf(render: () => unknown): string | undefined {
  try {
    render();
  } catch (error) {
    return (error as { digest?: string }).digest;
  }
  return undefined;
}

const gate = () => digestOf(() => DevLayout({ children: "specimens" }));

describe("dev layout gate (ac-1)", () => {
  it("answers 404 when APP_ENV is production", () => {
    vi.stubEnv("APP_ENV", "production");
    expect(gate()).toMatch(/404/);
  });

  it("answers 404 when APP_ENV is unset", () => {
    vi.stubEnv("APP_ENV", undefined);
    expect(gate()).toMatch(/404/);
  });

  it("renders on a preview deployment built with NODE_ENV production", () => {
    vi.stubEnv("APP_ENV", "preview");
    vi.stubEnv("NODE_ENV", "production");
    expect(gate()).toBeUndefined();
  });

  it("renders in development", () => {
    vi.stubEnv("APP_ENV", "development");
    vi.stubEnv("NODE_ENV", "development");
    expect(gate()).toBeUndefined();
  });
});
