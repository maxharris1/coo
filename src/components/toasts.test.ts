import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createToasts } from "./toasts";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

it("shows each message until its lifetime runs out", () => {
  const toasts = createToasts(4000);
  const changed = vi.fn();
  toasts.subscribe(changed);

  toasts.show("Not a friend yet.");
  vi.advanceTimersByTime(1000);
  toasts.show("That bird is resting.");
  expect(toasts.getSnapshot().map((t) => t.message)).toEqual([
    "Not a friend yet.",
    "That bird is resting.",
  ]);

  vi.advanceTimersByTime(3000);
  expect(toasts.getSnapshot().map((t) => t.message)).toEqual([
    "That bird is resting.",
  ]);
  vi.advanceTimersByTime(1000);
  expect(toasts.getSnapshot()).toEqual([]);
  expect(changed).toHaveBeenCalledTimes(4);
});

it("dismisses a toast early", () => {
  const toasts = createToasts(4000);
  toasts.show("Not a friend yet.");
  toasts.dismiss(toasts.getSnapshot()[0].id);
  expect(toasts.getSnapshot()).toEqual([]);
});
