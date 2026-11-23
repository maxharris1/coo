import { describe, expect, it } from "vitest";
import { declaration, type Ref } from "../app/safeArea.testkit";

const TRACKER = "components/Tracker.module.css";
const GLOBALS = "app/globals.css";
const at = (file: string, rule: string, prop: string): Ref => ({
  file,
  rule,
  prop,
});
const has = (ref: Ref) => {
  try {
    return declaration(ref);
  } catch {
    return undefined;
  }
};

describe("shared long-string utilities", () => {
  it("coo-wrap lets a flex or grid child shrink and breaks long words", () => {
    expect(declaration(at(GLOBALS, "coo-wrap", "min-width"))).toBe("0");
    expect(declaration(at(GLOBALS, "coo-wrap", "overflow-wrap"))).toBe(
      "anywhere",
    );
  });

  it("coo-truncate keeps one line and ellipsizes", () => {
    expect(declaration(at(GLOBALS, "coo-truncate", "min-width"))).toBe("0");
    expect(declaration(at(GLOBALS, "coo-truncate", "overflow"))).toBe("hidden");
    expect(declaration(at(GLOBALS, "coo-truncate", "text-overflow"))).toBe(
      "ellipsis",
    );
    expect(declaration(at(GLOBALS, "coo-truncate", "white-space"))).toBe(
      "nowrap",
    );
  });
});

describe("tracker stats stay inside their cards (ac-2)", () => {
  it("never forces a stat value onto one unclipped line", () => {
    expect(has(at(TRACKER, "value", "white-space"))).toBeUndefined();
    expect(has(at(TRACKER, "label", "white-space"))).toBeUndefined();
  });

  it("lets each stat card shrink to its grid column", () => {
    expect(declaration(at(TRACKER, "stats", "grid-template-columns"))).toBe(
      "repeat(3, minmax(0, 1fr))",
    );
    expect(declaration(at(TRACKER, "stat", "min-width"))).toBe("0");
  });

  it("steps the value down from 17px to 14px on narrow phones", () => {
    expect(declaration(at(TRACKER, "value", "font-size"))).toBe(
      "clamp(14px, 4.4vw, 17px)",
    );
  });
});

describe("tracker headline wraps inside its words column (ac-3)", () => {
  it("balances the headline and keeps the words column shrinkable", () => {
    expect(declaration(at(TRACKER, "headline", "text-wrap"))).toBe("balance");
    expect(declaration(at(TRACKER, "words", "min-width"))).toBe("0");
  });

  it("still ellipsizes the Bird → Friend route", () => {
    expect(declaration(at(TRACKER, "route span", "overflow"))).toBe("hidden");
    expect(declaration(at(TRACKER, "route span", "text-overflow"))).toBe(
      "ellipsis",
    );
    expect(declaration(at(TRACKER, "route span", "white-space"))).toBe(
      "nowrap",
    );
  });
});

describe("progress places never collide with the miles (ac-4)", () => {
  it("gives each place a shrinkable column either side of the miles", () => {
    expect(declaration(at(TRACKER, "ends", "display"))).toBe("grid");
    expect(declaration(at(TRACKER, "ends", "grid-template-columns"))).toBe(
      "minmax(0, 1fr) auto minmax(0, 1fr)",
    );
    expect(declaration(at(TRACKER, "to", "text-align"))).toBe("end");
  });
});

describe("the same rules hold beyond the tracker (#925 ac-5)", () => {
  const JOB = "app/(app)/jobs/[id]/JobTracker.module.css";
  const SILL = "app/(app)/sill/Sill.module.css";
  const NOTIFICATIONS = "app/(app)/notifications/Notifications.module.css";
  const TOASTS = "components/Toasts.module.css";
  const LOG = "components/FlightLog.module.css";
  const SHOEBOX = "app/(app)/shoebox/ShoeboxTop.module.css";
  const FRIENDS = "app/(app)/friends/Friends.module.css";
  const FLOCK = "app/(app)/Flock.module.css";
  const FLIGHTS = "app/(app)/flights/Flights.module.css";

  it.each([
    [JOB, "headline"],
    [JOB, "sub"],
    [JOB, "job"],
    [SILL, "rowName"],
    [SILL, "rowLine"],
    [NOTIFICATIONS, "rowTitle"],
    [NOTIFICATIONS, "rowBody"],
    [TOASTS, "toast"],
    [LOG, "line span"],
  ])("%s .%s wraps a long word inside its box", (file, rule) => {
    expect(declaration(at(file, rule, "min-width"))).toBe("0");
    expect(declaration(at(file, rule, "overflow-wrap"))).toBe("anywhere");
  });

  it("balances the job tracker headline like the flight tracker's", () => {
    expect(declaration(at(JOB, "headline", "text-wrap"))).toBe("balance");
    expect(declaration(at(JOB, "words", "min-width"))).toBe("0");
  });

  it("still ellipsizes the bird name in the job tracker title pill", () => {
    expect(declaration(at(JOB, "name", "overflow"))).toBe("hidden");
    expect(declaration(at(JOB, "name", "text-overflow"))).toBe("ellipsis");
  });

  it("caps a Shoebox friend chip at the scroller and ellipsizes the name", () => {
    expect(declaration(at(SHOEBOX, "chips", "overflow-x"))).toBe("auto");
    expect(declaration(at(SHOEBOX, "chip", "max-width"))).toBe("100%");
    expect(declaration(at(SHOEBOX, "chip", "overflow"))).toBe("hidden");
    expect(declaration(at(SHOEBOX, "chip", "text-overflow"))).toBe("ellipsis");
    expect(declaration(at(SHOEBOX, "chip", "white-space"))).toBe("nowrap");
  });

  it.each([
    [FRIENDS, "name"],
    [FRIENDS, "line"],
    [FLOCK, "name"],
    [FLIGHTS, "rowTitle"],
    [FLIGHTS, "line"],
  ])("%s .%s already wraps long names, so it is untouched", (file, rule) => {
    expect(declaration(at(file, rule, "overflow-wrap"))).toBe("anywhere");
  });
});
