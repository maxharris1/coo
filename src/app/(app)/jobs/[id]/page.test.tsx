import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MapViewProps } from "@/components/MapView";
import { SyncContext, type SyncState } from "@/components/SyncProvider";
import type { JobView } from "@/server/services/jobs/get";
import { JobError } from "./JobError";
import { JobTracker } from "./JobTracker";
import { loadJob } from "./jobApi";
import JobPage from "./page";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "j1" }) }));

const maps = vi.hoisted(() => [] as MapViewProps[]);
vi.mock("@/components/MapView", () => ({
  MapView: (props: MapViewProps) => {
    maps.push(props);
    return <div data-map="true" />;
  },
}));

const loft = { lat: 40.68, lon: -73.97, label: "Prospect Heights" };
const dest = { lat: 40.72, lon: -73.99, label: "the deli on 4th" };
const job: JobView = {
  id: "j1",
  jobId: "deli-slip",
  text: "Rush an order slip to the deli on 4th",
  short: "odd job for the deli",
  startedAt: "2026-11-22T15:00:00.000Z",
  endsAt: "2026-11-22T15:12:00.000Z",
  status: "running",
  bird: { id: "b1", name: "Gerald", look: "gerald", gear: [] },
  map: { loft, dest },
};
const OFFSET_MS = 5000;

function respond(status: number, body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

function trackerAt(at: string, j: JobView = job) {
  maps.length = 0;
  vi.setSystemTime(Date.parse(at) - OFFSET_MS);
  const html = renderToStaticMarkup(
    <JobTracker job={j} offsetMs={OFFSET_MS} timeZone="America/New_York" />,
  );
  return { html, map: maps.at(-1) };
}

describe("loadJob", () => {
  it("asks the API for the job by id and returns it", async () => {
    const fetchFn = respond(200, { job });
    expect(await loadJob(fetchFn, "j1")).toEqual({ ok: true, job });
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/jobs/j1",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("escapes the id in the path", async () => {
    const fetchFn = respond(200, { job });
    await loadJob(fetchFn, "a/b");
    expect(fetchFn).toHaveBeenCalledWith("/api/jobs/a%2Fb", expect.anything());
  });

  it("passes the API's error code through", async () => {
    const fetchFn = respond(404, { error: { code: "not_found" } });
    expect(await loadJob(fetchFn, "j1")).toEqual({
      ok: false,
      code: "not_found",
    });
  });

  it("reports unreachable when the request fails", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("offline");
    });
    expect(await loadJob(fetchFn, "j1")).toEqual({
      ok: false,
      code: "unreachable",
    });
  });
});

describe("/jobs/[id] page", () => {
  it("shows the loader before the job arrives", () => {
    const html = renderToStaticMarkup(
      <SyncContext.Provider
        value={
          {
            data: null,
            error: null,
            offsetMs: 0,
            refresh: () => {},
          } satisfies SyncState
        }
      >
        <JobPage />
      </SyncContext.Provider>,
    );
    expect(html).toContain('aria-busy="true"');
  });

  it("says the job is missing and links back to Earn", () => {
    const html = renderToStaticMarkup(<JobError code="not_found" />);
    expect(html).toContain("We could not find this job.");
    expect(html).toContain('href="/earn"');
  });
});

describe("JobTracker", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("flies out from the loft before the midpoint", () => {
    const { html, map } = trackerAt("2026-11-22T15:05:59.999Z");
    expect(html).toContain("On an odd job");
    expect(html).toContain("Home at 10:12 am");
    expect(html).toContain("Gerald");
    expect(html).toContain("Rush an order slip to the deli on 4th");
    expect(map).toMatchObject({
      from: loft,
      to: dest,
      loftLabel: "Your loft",
      sillLabel: "the deli on 4th",
    });
    expect(map?.flightId).toBe("j1:out");
  });

  it("turns for home at the midpoint", () => {
    const { html, map } = trackerAt("2026-11-22T15:06:00.000Z");
    expect(html).toContain("Heading home");
    expect(html).toContain("Home at 10:12 am");
    expect(map).toMatchObject({
      from: dest,
      to: loft,
      loftLabel: "the deli on 4th",
      sillLabel: "Your loft",
    });
    expect(map?.flightId).toBe("j1:back");
  });

  it("keeps heading home after the midpoint", () => {
    const { html, map } = trackerAt("2026-11-22T15:11:00.000Z");
    expect(html).toContain("Heading home");
    expect(map?.from).toEqual(dest);
    expect(map?.flightId).toBe("j1:back");
  });

  it("is home once the job ends", () => {
    const { html, map } = trackerAt("2026-11-22T15:12:00.000Z");
    expect(html).toContain("Gerald is home.");
    expect(html).toContain('href="/earn"');
    expect(html).not.toContain("Heading home");
    expect(map).toBeUndefined();
  });

  it("is home when the job is done, even before it was due", () => {
    const { html, map } = trackerAt("2026-11-22T15:03:00.000Z", {
      ...job,
      status: "done",
    });
    expect(html).toContain("Gerald is home.");
    expect(map).toBeUndefined();
  });

  it("shows the job without a map when it has no destination", () => {
    const legacy = { ...job, map: null };
    const out = trackerAt("2026-11-22T15:03:00.000Z", legacy);
    expect(out.html).toContain("On an odd job");
    expect(out.html).toContain("Home at 10:12 am");
    expect(out.html).toContain("Rush an order slip to the deli on 4th");
    expect(out.map).toBeUndefined();
    expect(out.html).not.toContain('data-map="true"');

    const back = trackerAt("2026-11-22T15:09:00.000Z", legacy);
    expect(back.html).toContain("Heading home");
    expect(back.map).toBeUndefined();
  });
});
