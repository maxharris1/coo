import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SyncContext, type SyncState } from "@/components/SyncProvider";
import { ToastProvider } from "@/components/Toasts";
import type { SyncPayload } from "@/components/sync";
import type { RoommateState } from "./roommate";
import { RoommateView } from "./RoommateView";
import RoommatePage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
}));

const css = readFileSync(
  new URL("./Roommate.module.css", import.meta.url),
  "utf8",
);

const render = (state: RoommateState) =>
  renderToStaticMarkup(
    <RoommateView state={state} dispatch={() => {}} onSubmit={() => {}} />,
  ).replaceAll("&#x27;", "'");

const naming: Extract<RoommateState, { kind: "naming" }> = {
  kind: "naming",
  first: "Gerry",
  look: "brenda",
  name: "Mabel",
  pronoun: "she",
  edited: true,
  sending: false,
};

describe("/aviary/roommate naming (ac-4)", () => {
  const html = render(naming);

  it("says the first bird has a roommate", () => {
    expect(html).toMatch(/<h1[^>]*>Gerry has a roommate<\/h1>/);
  });

  it("draws the next starter look", () => {
    expect(html).toContain('role="img" aria-label="Brenda"');
  });

  it("asks for the roommate's name and keeps what was typed", () => {
    expect(html).toMatch(
      /<label[^>]*for="roommate-name"[^>]*>Name the roommate/,
    );
    expect(html).toMatch(/<input[^>]*id="roommate-name"[^>]*value="Mabel"/);
  });

  it("offers the three pronoun chips with the chosen one checked", () => {
    expect(html).toMatch(/<legend[^>]*>Pronoun<\/legend>/);
    const radios = [
      ...html.matchAll(/type="radio"[^>]*name="pronoun"[^>]*value="(\w+)"/g),
    ];
    expect(radios.map((m) => m[1])).toEqual(["he", "she", "they"]);
    expect(html).toMatch(/checked="" value="she"/);
  });

  it("adopts the roommate by name", () => {
    expect(html).toMatch(/<button type="submit"[^>]*>Adopt Mabel<\/button>/);
  });

  it("disables Adopt while sending", () => {
    expect(render({ ...naming, sending: true })).toMatch(
      /<button type="submit"[^>]*disabled=""[^>]*>Adopt Mabel/,
    );
  });

  it("leaves onboarding behind: no Your name field, no Back button", () => {
    expect(html).not.toContain('id="your-name"');
    expect(html).not.toMatch(/<button[^>]*type="button"/);
  });

  it("links back to the loft", () => {
    const back = html.match(/<a [^>]*aria-label="Back to the loft"[^>]*>/);
    expect(back?.[0]).toContain('href="/"');
  });

  it("keeps the back link and Adopt at the 44 px touch size", () => {
    for (const cls of ["back", "go"]) {
      const rule = css.match(new RegExp(`\\.${cls}[^{]*\\{[^}]*\\}`))?.[0];
      expect(rule, `.${cls}`).toMatch(
        /(min-)?(height|width): (var\(--coo-touch\)|4[4-9]px|[5-9]\dpx)/,
      );
    }
  });
});

describe("/aviary/roommate not owed (ac-4)", () => {
  const html = render({ kind: "none" });

  it("drops the form and links back to the loft with a short line", () => {
    expect(html).not.toContain("<form");
    expect(html).toContain("Nobody new is moving in right now.");
    expect(html).toMatch(/<a [^>]*href="\/"[^>]*>Back to the loft<\/a>/);
  });
});

describe("/aviary/roommate page", () => {
  const renderPage = (data: SyncPayload | null) =>
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
          <RoommatePage />
        </ToastProvider>
      </SyncContext.Provider>,
    ).replaceAll("&#x27;", "'");

  it("shows the loader until the first sync lands", () => {
    const html = renderPage(null);
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("<form");
  });

  it("prefills a free name from the synced flock (ac-5)", () => {
    const html = renderPage({
      me: { perches: 2 },
      birds: [{ name: "Gerald", look: "kevin" }],
    } as unknown as SyncPayload);
    expect(html).toMatch(/<h1[^>]*>Gerald has a roommate<\/h1>/);
    expect(html).toContain('role="img" aria-label="Gerald"');
    expect(html).toMatch(/<input[^>]*id="roommate-name"[^>]*value="Brenda"/);
  });

  it("sends a full loft back to the loft", () => {
    const html = renderPage({
      me: { perches: 4 },
      birds: [
        { name: "Gerald", look: "gerald" },
        { name: "Brenda", look: "brenda" },
      ],
    } as unknown as SyncPayload);
    expect(html).not.toContain("<form");
    expect(html).toMatch(/<a [^>]*href="\/"[^>]*>Back to the loft<\/a>/);
  });
});
