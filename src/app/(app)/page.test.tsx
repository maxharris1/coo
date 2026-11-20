import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SyncContext, type SyncState } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import MainPage from "./page";

const render = (data: SyncPayload | null) =>
  renderToStaticMarkup(
    <SyncContext.Provider
      value={
        {
          data,
          error: null,
          offsetMs: 0,
          refresh: () => {},
        } satisfies SyncState
      }
    >
      <MainPage />
    </SyncContext.Provider>,
  );

describe("Main at / (ac-1, ac-2)", () => {
  it("shows the loader until the first sync lands", () => {
    expect(render(null)).toContain('aria-busy="true"');
  });

  it("shows the header, greeting and loft once synced", () => {
    const html = render({
      me: { seeds: 12, timezone: "UTC", loft: null },
      serverNow: Date.parse("2026-11-20T19:00:00Z"),
      birds: [],
    } as unknown as SyncPayload);
    expect(html).toContain("Evening. No birds yet.");
    expect(html).toContain("<span>12</span>");
  });
});
