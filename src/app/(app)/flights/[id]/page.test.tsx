import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SyncContext, type SyncState } from "@/components/SyncProvider";
import type { Flight } from "@/server/services/flights/shape";
import { FlightError } from "./FlightError";
import { loadFlight } from "./flightApi";
import FlightPage from "./page";

vi.mock("next/navigation", () => ({ useParams: () => ({ id: "f1" }) }));

const flight = { id: "f1", bird: { name: "Gerald" } } as Flight;

function respond(status: number, body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status }));
}

describe("loadFlight", () => {
  it("asks the API for the flight by id and returns it", async () => {
    const fetchFn = respond(200, { flight, serverNow: 42 });
    expect(await loadFlight(fetchFn, "f1")).toEqual({ ok: true, flight });
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/flights/f1",
      expect.objectContaining({ cache: "no-store" }),
    );
  });

  it("passes the API's error code through", async () => {
    const fetchFn = respond(404, {
      error: { code: "not_found", message: "flight not found" },
    });
    expect(await loadFlight(fetchFn, "f1")).toEqual({
      ok: false,
      code: "not_found",
    });
  });

  it("reports unreachable when the request fails", async () => {
    const fetchFn = vi.fn(async () => {
      throw new TypeError("offline");
    });
    expect(await loadFlight(fetchFn, "f1")).toEqual({
      ok: false,
      code: "unreachable",
    });
  });

  it("escapes the id in the path", async () => {
    const fetchFn = respond(200, { flight });
    await loadFlight(fetchFn, "a/b");
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/flights/a%2Fb",
      expect.anything(),
    );
  });
});

describe("/flights/[id] page", () => {
  it("shows the loader before the flight arrives", () => {
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
        <FlightPage />
      </SyncContext.Provider>,
    );
    expect(html).toContain('aria-busy="true"');
  });
});

describe("FlightError", () => {
  it("says the bird is not there for a missing flight, with a way back", () => {
    const html = renderToStaticMarkup(<FlightError code="not_found" />);
    expect(html).toContain("We could not find this flight.");
    expect(html).toContain('href="/flights"');
  });

  it("asks to try again when the loft is unreachable", () => {
    const html = renderToStaticMarkup(<FlightError code="unreachable" />);
    expect(html).toContain("We could not reach the loft. Try again.");
  });
});
