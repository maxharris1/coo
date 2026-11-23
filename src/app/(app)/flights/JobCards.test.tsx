import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SyncPayload } from "@/components/sync";
import type { JobView } from "@/server/services/jobs/get";
import { jobCards } from "./JobCards";

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

const working = (over: Partial<Bird> = {}) =>
  bird({ status: "busy", busyKind: "job", busyUntil: UNTIL, ...over });

const job = (over: Partial<JobView> = {}): JobView => ({
  id: "j-77",
  jobId: "deli-slip",
  text: "Rush an order slip to the deli on 4th",
  short: "odd job for the deli",
  startedAt: new Date(NOW - 10 * 60_000).toISOString(),
  endsAt: new Date(UNTIL).toISOString(),
  status: "running",
  bird: { id: "b-gerald", name: "Gerald", look: "gerald", gear: [] },
  map: {
    loft: { lat: 40.68, lon: -73.97, label: "Prospect Heights" },
    dest: { lat: 40.72, lon: -73.99, label: "the deli on 4th" },
  },
  ...over,
});

const html = (birds: Bird[], jobs: JobView[] = []) =>
  renderToStaticMarkup(
    <>
      {jobCards({
        birds,
        jobs: new Map(jobs.map((j) => [j.id, j])),
        timeZone: "America/New_York",
        nowMs: NOW,
        offsetMs: 0,
      })}
    </>,
  );

describe("Flights odd job cards", () => {
  it("shows a bird on an odd job with its return time in the owner's timezone and no heading", () => {
    const out = html([working()]);
    expect(out).not.toContain("<h2");
    expect(out).not.toContain("On odd jobs");
    expect(out).toContain("Gerald, on an odd job");
    expect(out).toContain("Home this afternoon");
    expect(out).not.toMatch(/\d{1,2}:\d{2}\s?[ap]m/i);
    expect(out).toContain(">Working<");
  });

  it("gives a card with a job id and a stored dest a map preview that links to the job tracker", () => {
    const out = html([working({ jobId: "j-77" })], [job()]);
    const link = out.match(/<a\b[^>]*href="\/jobs\/j-77"[^>]*>[\s\S]*<\/a>/);
    expect(link).not.toBeNull();
    expect(link![0]).toContain("Gerald, on an odd job");
    expect(link![0]).toContain("pin-loft.svg");
    expect(link![0]).toContain("pin-sill.svg");
    expect(link![0]).toContain('aria-hidden="true"');
  });

  it("keeps a card as text with no link when the job has no stored dest", () => {
    const out = html([working({ jobId: "j-77" })], [job({ map: null })]);
    expect(out).toContain("Gerald, on an odd job");
    expect(out).not.toContain("<a");
    expect(out).not.toContain("pin-loft.svg");
  });

  it("keeps a card as text with no link until its job has loaded", () => {
    const out = html([working({ jobId: "j-77" })]);
    expect(out).toContain("Gerald, on an odd job");
    expect(out).not.toContain("<a");
  });

  it("keeps a card as text with no link when the job id is null", () => {
    const out = html([working({ jobId: null })], [job()]);
    expect(out).toContain("Gerald, on an odd job");
    expect(out).not.toContain("<a");
    expect(out).not.toContain("pin-loft.svg");
  });

  it("lists one card per working bird", () => {
    const out = html([working(), working({ id: "b-kevin", name: "Kevin" })]);
    expect(out).toContain("Gerald, on an odd job");
    expect(out).toContain("Kevin, on an odd job");
  });

  it("leaves out visiting, napping, bathing and flying birds", () => {
    expect(
      html([
        bird({}),
        bird({ status: "visiting" as Bird["status"] }),
        bird({ status: "busy", busyKind: "nap", busyUntil: UNTIL }),
        bird({ status: "busy", busyKind: "bath", busyUntil: UNTIL }),
        bird({ status: "flying" }),
      ]),
    ).toBe("");
  });
});
