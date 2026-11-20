import { StrictMode, act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SyncProvider } from "./SyncProvider";

let active = 0;
let maximum = 0;

const fetch = vi.fn<typeof globalThis.fetch>(
  (_url, init) =>
    new Promise<Response>((_resolve, reject) => {
      maximum = Math.max(maximum, ++active);
      init?.signal?.addEventListener("abort", () => {
        active--;
        reject(init.signal!.reason);
      });
    }),
);

beforeEach(() => {
  active = 0;
  maximum = 0;
  fetch.mockClear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { HTMLIFrameElement: class {} }),
  );
  vi.stubGlobal(
    "document",
    Object.assign(new EventTarget(), { visibilityState: "visible" }),
  );
  vi.stubGlobal("fetch", fetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

it("keeps one request in flight when StrictMode replays the effect", async () => {
  const container = Object.assign(new EventTarget(), {
    nodeType: 1,
    tagName: "DIV",
    ownerDocument: document,
  }) as unknown as Element;
  const root = createRoot(container);
  await act(async () => {
    root.render(
      <StrictMode>
        <SyncProvider>{null}</SyncProvider>
      </StrictMode>,
    );
  });
  expect(fetch, "StrictMode mounted the effect twice").toHaveBeenCalledTimes(2);
  expect(maximum, "requests in flight at once").toBe(1);
  await act(async () => root.unmount());
  expect(active, "unmount cancels the pending request").toBe(0);
});
