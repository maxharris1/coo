import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SyncContext } from "@/components/SyncProvider";
import { ToastProvider } from "@/components/Toasts";
import type { LocalDate } from "@/lib/game/time";
import type { Earn } from "@/server/services/earn";
import { earnTop, type EarnState } from "./earn";
import { EarnView } from "./EarnView";
import EarnPage from "./page";

const panels: unknown[] = [];

vi.mock("./JobsPanel", () => ({
  JobsPanel: (props: unknown) => {
    panels.push(props);
    return null;
  },
}));

const css = readFileSync(new URL("./Earn.module.css", import.meta.url), "utf8");

const EARN: Earn = {
  seeds: 240,
  punchCard: {
    weekStart: "2026-11-16" as LocalDate,
    deliveries: 6,
    size: 10,
    pay: 50,
    paid: false,
  },
  payTable: {
    delivery: {
      base: 10,
      milesPerBonusSeed: 25,
      fullPayPerDay: 5,
      reducedPay: 2,
    },
    replyHome: 5,
    newCity: 25,
    partyHatWeekend: null,
  },
  jobs: {
    offers: [{ id: "job-1", text: "Sort the mail", minutes: 5, pay: 4 }],
    leftToday: 2,
  },
  found: [
    { id: "f-1", objectId: "button", name: "A button", value: 3, birdId: null },
  ],
  earned: null,
};

const render = (state: EarnState) =>
  renderToStaticMarkup(<EarnView state={state} onRetry={() => {}} />);

const ready = (earn: Earn = EARN) =>
  render({
    kind: "ready",
    top: earnTop(earn),
    jobs: earn.jobs,
    found: earn.found,
  });

describe("/earn header", () => {
  const html = ready();

  it("links back to the seed store", () => {
    expect(html).toMatch(
      /<a[^>]*href="\/shop"[^>]*aria-label="Back to the seed store"|<a[^>]*aria-label="Back to the seed store"[^>]*href="\/shop"/,
    );
  });

  it("titles the page Earn seeds", () => {
    expect(html).toMatch(/<h1[^>]*>Earn seeds<\/h1>/);
  });

  it("shows the seed balance with a label", () => {
    expect(html).toMatch(
      /<div[^>]*aria-label="You have 240 seeds"[^>]*>.*<svg[\s\S]*?<span>240<\/span><\/div>/,
    );
  });

  it("says one seed in the singular", () => {
    expect(ready({ ...EARN, seeds: 1 })).toContain(
      'aria-label="You have 1 seed"',
    );
  });

  it("hides the balance while loading or failed", () => {
    expect(render({ kind: "loading" })).not.toContain("You have");
    expect(render({ kind: "failed", message: "Sign in first." })).not.toContain(
      "You have",
    );
  });

  it("keeps the back link and balance pill 44 px tap targets", () => {
    expect(css).toMatch(/\.back\s*{[^}]*width:\s*var\(--coo-touch\)/);
    expect(css).toMatch(/\.back\s*{[^}]*height:\s*var\(--coo-touch\)/);
    expect(css).toMatch(/\.balance\s*{[^}]*min-height:\s*var\(--coo-touch\)/);
  });

  it("lets the title shrink and keeps the pill on one line at 360 px", () => {
    expect(css).toMatch(/\.title\s*{[^}]*min-width:\s*0/);
    expect(css).toMatch(/\.balance\s*{[^}]*flex-shrink:\s*0/);
  });
});

describe("/earn punch card", () => {
  const html = ready();
  const card = html.match(
    /<section[^>]*aria-label="Post office punch card"[^>]*>([\s\S]*?)<\/section>/,
  )?.[1];
  const stamps = card?.match(/<div class="[^"]*"><\/div>/g) ?? [];
  const kind = (cls: string) => stamps.filter((s) => s.includes(cls)).length;

  it("heads the card with its label and the week", () => {
    expect(card).toContain(">POST OFFICE PUNCH CARD<");
    expect(card).toContain(">WEEK OF NOV 16<");
  });

  it("draws 6 punched, 3 open and the prize slot for the reference week", () => {
    expect(card).toMatch(
      /role="img"[^>]*aria-label="6 of 10 deliveries punched"/,
    );
    expect(stamps).toHaveLength(10);
    expect(kind("punched")).toBe(6);
    expect(kind("open")).toBe(3);
    expect(kind("prize")).toBe(1);
    expect(stamps[9]).toContain("prize");
  });

  it("says how far along the week is", () => {
    expect(card).toContain(
      ">6 of 10 deliveries this week. A full card pays 50 seeds.<",
    );
  });

  it("paints punched ink, open dashed and the prize sun yellow", () => {
    expect(css).toMatch(/\.punched\s*{[^}]*background:\s*var\(--coo-ink\)/);
    expect(css).toMatch(/\.open\s*{[^}]*border-style:\s*dashed/);
    expect(css).toMatch(/\.prize\s*{[^}]*background:\s*var\(--coo-sun\)/);
  });

  it("lets the stamps shrink and the label row wrap at 360 px", () => {
    expect(css).toMatch(/\.stamp\s*{[^}]*flex:\s*0 1 26px/);
    expect(css).toMatch(/\.stamp\s*{[^}]*aspect-ratio:\s*1/);
    expect(css).toMatch(/\.cardHead\s*{[^}]*flex-wrap:\s*wrap/);
  });

  it("leaves the pay table to a later ticket", () => {
    expect(html).not.toContain("Every delivery pays");
  });

  it("hands jobs and found objects to the jobs panel", () => {
    panels.length = 0;
    ready();
    expect(panels).toEqual([{ jobs: EARN.jobs, found: EARN.found }]);
  });
});

describe("/earn states", () => {
  it("shows the loader while GET /api/earn is pending", () => {
    const html = renderToStaticMarkup(
      <SyncContext.Provider
        value={{ data: null, error: null, offsetMs: 0, refresh: () => {} }}
      >
        <ToastProvider>
          <EarnPage />
        </ToastProvider>
      </SyncContext.Provider>,
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain("punch card");
  });

  it("shows the API's message and a retry when the load fails", () => {
    const html = render({ kind: "failed", message: "Sign in first." });
    expect(html).toMatch(/<h1[^>]*>Earn seeds<\/h1>/);
    expect(html).toContain("Sign in first.");
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Try again<\/button>/);
    expect(html).not.toContain("punch card");
    expect(css).toMatch(/\.retry\s*{[^}]*min-height:\s*var\(--coo-touch\)/);
  });
});
