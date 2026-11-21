import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import PigeonPage from "./app/(app)/birds/[id]/page";
vi.mock("next/navigation", () => ({ useParams: () => ({ id: "bird-id" }) }));
vi.mock("@/components/SyncProvider", () => ({
  useSync: () => ({
    data: null,
    error: "We could not reach the loft. Try again.",
    offsetMs: 0,
    refresh: vi.fn(),
  }),
}));
vi.mock("@/components/Toasts", () => ({ useToast: () => vi.fn() }));
it("reports a completed failed initial sync instead of keeping the loading state", () => {
  const html = renderToStaticMarkup(<PigeonPage />);
  console.log("Rendered after sync failure:", html);
  expect(html).toContain("We could not reach the loft. Try again.");
});
