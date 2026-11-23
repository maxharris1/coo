import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SyncPayload } from "@/components/sync";
import { JobsSection } from "./JobsSection";

type Bird = SyncPayload["birds"][number];

const UNTIL = Date.parse("2026-11-20T19:40:00Z");
const NOW = UNTIL - 40 * 60_000;

const bird = (over: Partial<Bird>): Bird =>
  ({
    id: "b-gerald",
    name: "Gerald",
    look: "gerald",
    gear: [],
    status: "home",
    busyKind: null,
    busyUntil: null,
    jobId: null,
    ...over,
  }) as Bird;

const html = (birds: Bird[]) =>
  renderToStaticMarkup(
    <JobsSection birds={birds} timeZone="America/New_York" nowMs={NOW} />,
  );

describe("Flights odd jobs", () => {
  it("shows a bird on an odd job with its return time in the owner's timezone", () => {
    const out = html([
      bird({ status: "busy", busyKind: "job", busyUntil: UNTIL }),
    ]);
    expect(out).toMatch(/<h2[^>]*>On odd jobs<\/h2>/);
    expect(out).toContain("Gerald, on an odd job");
    expect(out).toContain("Home this afternoon");
    expect(out).not.toMatch(/\d{1,2}:\d{2}\s?[ap]m/i);
    expect(out).toContain(">Working<");
  });

  it("links a card to the job tracker when the job id is known", () => {
    const out = html([
      bird({
        status: "busy",
        busyKind: "job",
        busyUntil: UNTIL,
        jobId: "j-77",
      }),
    ]);
    expect(out).toMatch(
      /<a[^>]*href="\/jobs\/j-77"[^>]*>.*Gerald, on an odd job/s,
    );
  });

  it("keeps a card as text when the job id is null", () => {
    const out = html([
      bird({ status: "busy", busyKind: "job", busyUntil: UNTIL, jobId: null }),
    ]);
    expect(out).toContain("Gerald, on an odd job");
    expect(out).not.toContain("<a");
  });

  it("lists one row per working bird", () => {
    const out = html([
      bird({ status: "busy", busyKind: "job", busyUntil: UNTIL }),
      bird({
        id: "b-kevin",
        name: "Kevin",
        status: "busy",
        busyKind: "job",
        busyUntil: UNTIL,
      }),
    ]);
    expect(out).toContain("Gerald, on an odd job");
    expect(out).toContain("Kevin, on an odd job");
  });

  it("renders nothing when no bird is on a job", () => {
    expect(
      html([
        bird({}),
        bird({ status: "busy", busyKind: "nap", busyUntil: UNTIL }),
        bird({ status: "flying" }),
      ]),
    ).toBe("");
  });
});
