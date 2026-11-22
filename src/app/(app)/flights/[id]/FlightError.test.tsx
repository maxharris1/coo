import { readdirSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { getRouteMatcher } from "next/dist/shared/lib/router/utils/route-matcher";
import { getRouteRegex } from "next/dist/shared/lib/router/utils/route-regex";
import { getSortedRoutes } from "next/dist/shared/lib/router/utils/sorted-routes";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SyncContext, type SyncState } from "@/components/SyncProvider";
import { ToastProvider } from "@/components/Toasts";
import FlightsPage from "../page";
import { FlightError } from "./FlightError";

const APP = join(process.cwd(), "src/app");
const pageFiles = new Map(
  readdirSync(APP, { recursive: true, encoding: "utf8" })
    .filter((file) => /(^|\/)page\.tsx$/.test(file.split(sep).join("/")))
    .map((file) => {
      const segments = dirname(file)
        .split(sep)
        .filter((s) => s !== "." && !/^\(.*\)$/.test(s));
      return [`/${segments.join("/")}`, join(APP, file)] satisfies [
        string,
        string,
      ];
    }),
);
const precedence = getSortedRoutes([...pageFiles.keys()]);

async function open(href: string) {
  const route = precedence.find((p) => getRouteMatcher(getRouteRegex(p))(href));
  if (!route) return { status: 404, page: null };
  const mod: { default: () => React.ReactNode } = await import(
    pageFiles.get(route)!
  );
  const Page = mod.default;
  renderToStaticMarkup(
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
      <ToastProvider>
        <Page />
      </ToastProvider>
    </SyncContext.Provider>,
  );
  return { status: 200, page: Page };
}

function backHref(code: string) {
  const html = renderToStaticMarkup(<FlightError code={code} />);
  const link = html.match(/<a [^>]*href="([^"]*)"[^>]*>Back to flights<\/a>/);
  return link?.[1];
}

describe("FlightError", () => {
  it("says the bird is not there for a missing flight", () => {
    const html = renderToStaticMarkup(<FlightError code="not_found" />);
    expect(html).toContain("We could not find this flight.");
  });

  it("asks to try again when the loft is unreachable", () => {
    const html = renderToStaticMarkup(<FlightError code="unreachable" />);
    expect(html).toContain("We could not reach the loft. Try again.");
  });

  it.each(["not_found", "unreachable"])(
    "links %s back to the Flights list, not a 404",
    async (code) => {
      const href = backHref(code);
      expect(href).toBe("/flights");
      const res = await open(href!);
      expect(res.status).toBe(200);
      expect(res.page).toBe(FlightsPage);
    },
  );

  it("treats a path with no page as a 404", async () => {
    expect((await open("/no-such-list")).status).toBe(404);
  });
});
