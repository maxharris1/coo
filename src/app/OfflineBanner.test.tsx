import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OfflineBanner, OfflineLine, onlineStore } from "./OfflineBanner";

const LINE =
  "You are offline. Birds keep flying. The map catches up when you are back.";

afterEach(() => vi.unstubAllGlobals());

describe("offline banner", () => {
  it("says the empty-states offline line as a status", () => {
    expect(renderToStaticMarkup(<OfflineLine />)).toMatch(
      new RegExp(`<p[^>]*role="status"[^>]*>${LINE}</p>`),
    );
  });

  it("renders nothing on the server, where the app is assumed online", () => {
    expect(renderToStaticMarkup(<OfflineBanner />)).toBe("");
  });

  it("follows navigator.onLine and wakes on online and offline events", () => {
    const events = new EventTarget();
    const navigator = { onLine: true };
    vi.stubGlobal("window", events);
    vi.stubGlobal("navigator", navigator);

    const onChange = vi.fn();
    const unsubscribe = onlineStore.subscribe(onChange);
    expect(onlineStore.getSnapshot()).toBe(true);

    navigator.onLine = false;
    events.dispatchEvent(new Event("offline"));
    expect(onlineStore.getSnapshot()).toBe(false);
    navigator.onLine = true;
    events.dispatchEvent(new Event("online"));
    expect(onChange).toHaveBeenCalledTimes(2);

    unsubscribe();
    events.dispatchEvent(new Event("offline"));
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
