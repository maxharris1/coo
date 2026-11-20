import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LOADER_DELAY_MS, LoaderView, afterDelay } from "./Loader";

describe("the walking-pigeon loader (ac-2)", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("waits 400 ms before it shows", () => {
    expect(LOADER_DELAY_MS).toBe(400);
    const show = vi.fn();
    afterDelay(show);
    vi.advanceTimersByTime(399);
    expect(show).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(show).toHaveBeenCalledOnce();
  });

  it("never shows when the data arrives first", () => {
    const show = vi.fn();
    const cancel = afterDelay(show);
    vi.advanceTimersByTime(200);
    cancel();
    vi.advanceTimersByTime(1000);
    expect(show).not.toHaveBeenCalled();
  });

  it("renders nothing visible before the delay and a labelled walking pigeon after", () => {
    const before = renderToStaticMarkup(<LoaderView shown={false} />);
    const after = renderToStaticMarkup(<LoaderView shown />);
    expect(before).toContain('aria-busy="true"');
    expect(before).not.toContain("<svg");
    expect(after).toContain('role="status"');
    expect(after).toContain("Loading");
    expect(after).toMatch(/<svg[^>]*viewBox/);
  });

  it("walks with motion.css keyframes and stands still under prefers-reduced-motion", () => {
    const css = readFileSync(
      new URL("./Loader.module.css", import.meta.url),
      "utf8",
    );
    expect(css).toMatch(/animation: coo-[a-z-]+ /);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{[^@]*\.walk \{\s*animation: none;/,
    );
  });
});
