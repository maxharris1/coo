import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SyncContext, type SyncState } from "@/components/SyncProvider";
import { ToastProvider } from "@/components/Toasts";
import type { SyncPayload } from "@/components/sync";
import SendPage from "./page";

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
      <ToastProvider>
        <SendPage />
      </ToastProvider>
    </SyncContext.Provider>,
  ).replaceAll("&#x27;", "'");

describe("/send page (ac-1)", () => {
  it("shows the loader until the first sync lands", () => {
    const html = render(null);
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("Who's it for?");
  });

  it("shows the screen with the ready count once synced", () => {
    const html = render({
      serverNow: Date.parse("2026-11-20T14:00:00Z"),
      me: { units: "mi", loft: null },
      birds: [
        { canFly: true, speedMph: 45 },
        { canFly: true, speedMph: 50 },
        { canFly: false, speedMph: 60 },
      ],
    } as unknown as SyncPayload);
    expect(html).toContain("Who's it for?");
    expect(html).toContain("Pick who it's for. 2 birds are ready.");
  });
});
