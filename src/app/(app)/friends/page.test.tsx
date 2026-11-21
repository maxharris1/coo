import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SyncContext, type SyncState } from "@/components/SyncProvider";
import { ToastProvider } from "@/components/Toasts";
import type { SyncPayload } from "@/components/sync";
import FriendsPage from "./page";

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
        <FriendsPage />
      </ToastProvider>
    </SyncContext.Provider>,
  );

describe("/friends page", () => {
  it("shows the loader until the first sync lands", () => {
    expect(render(null)).toContain('aria-busy="true"');
  });

  it("shows the invite card for the signed-in user once synced", () => {
    const html = render({
      me: { inviteCode: "max-7k2", units: "mi" },
    } as unknown as SyncPayload);
    expect(html).toContain("/join/max-7k2");
    expect(html).toContain("Your invite link");
  });
});
