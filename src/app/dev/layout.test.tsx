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

describe("dev layout gate", () => {
  it("answers 404 in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(digestOf(() => DevLayout({ children: "specimens" }))).toMatch(/404/);
  });

  it("renders its children outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(
      digestOf(() => DevLayout({ children: "specimens" })),
    ).toBeUndefined();
  });
});
