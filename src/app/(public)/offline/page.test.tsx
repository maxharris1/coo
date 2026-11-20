import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import OfflinePage from "./page";

const html = renderToStaticMarkup(<OfflinePage />);

describe("/offline", () => {
  it("shows the app header and the offline line", () => {
    expect(html).toMatch(/<h1[^>]*>coo<\/h1>/);
    expect(html).toContain("Messages, eventually.");
    expect(html).toMatch(
      /role="status"[^>]*>You are offline\. Birds keep flying\. The map catches up when you are back\.</,
    );
  });
});
