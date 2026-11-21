import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PushAsk, PushSheet } from "./PushAsk";

describe("notifications ask sheet (ac-1)", () => {
  it("asks the question as a labelled dialog with Yes and No", () => {
    const html = renderToStaticMarkup(
      <PushSheet onYes={() => {}} onNo={() => {}} />,
    );
    const labelledBy = html.match(
      /role="dialog"[^>]*aria-labelledby="([^"]+)"/,
    );
    expect(labelledBy).not.toBeNull();
    expect(html).toMatch(
      new RegExp(
        `id="${labelledBy![1]}"[^>]*>Want a tap on the shoulder when a bird lands\\?<`,
      ),
    );
    expect(html).toMatch(/<button type="button"[^>]*>Yes<\/button>/);
    expect(html).toMatch(/<button type="button"[^>]*>No<\/button>/);
  });

  it("renders nothing on the server", () => {
    expect(renderToStaticMarkup(<PushAsk />)).toBe("");
  });
});
