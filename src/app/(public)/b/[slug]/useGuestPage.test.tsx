import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guestGet } from "@/app/api/guest/[token]/get";
import { guestReportPost } from "@/app/api/guest/[token]/report/post";
import { createJsonRoute } from "@/server/http";
import { getGuestLink } from "@/server/services/guestLinks/get";
import { tick as runTick } from "@/server/services/tick";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { sendGuestFlight } from "@/test/guestFlight";
import { seedWorld, type World } from "@/test/seedWorld";
import { GuestExpired } from "./GuestExpired";
import {
  sendReport,
  TICK_MS,
  useGuestPage,
  type GuestShown,
} from "./useGuestPage";

vi.mock("@/env", () => ({
  getEnv: () => ({ LINK_TOKEN_PEPPER: PEPPER }),
}));

const PEPPER = "test-pepper";
const BODY = "Come see the new loft";
const DAY_MS = 24 * 60 * 60_000;

let deps: TestDeps;
let world: World;
let root: Root;
let seen: { shown: GuestShown; reported: () => void }[];

const last = () => seen[seen.length - 1];

function serveGuestApi() {
  const jsonRoute = createJsonRoute(async () => deps);
  const get = guestGet(jsonRoute, () => PEPPER);
  const report = guestReportPost(jsonRoute, () => PEPPER);
  return vi.fn(async (url: string, init?: RequestInit) => {
    const req = new NextRequest(new Request(`https://coo.test${url}`, init));
    return url.endsWith("/report") ? report(req) : get(req);
  });
}

type ProbeProps = {
  token: string;
  guest: Parameters<typeof useGuestPage>[0];
  serverNow: number;
};

function Probe({ token, guest, serverNow }: ProbeProps) {
  const { shown, reported } = useGuestPage(guest, token, serverNow);
  seen.push({ shown, reported });
  return null;
}

async function until(done: () => boolean) {
  for (let i = 0; i < 200 && !done(); i++) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
}

async function nextTick() {
  const fetchMock = fetch as ReturnType<typeof vi.fn>;
  const renders = seen.length;
  await act(async () => vi.advanceTimersByTime(TICK_MS));
  await act(async () => {
    await Promise.all(fetchMock.mock.results.map((r) => r.value));
  });
  await until(() => seen.length > renders + 1);
}

async function open(token: string) {
  const guest = await getGuestLink(deps, PEPPER, "203.0.113.9", token);
  await act(async () =>
    root.render(
      <Probe token={token} guest={guest} serverNow={deps.clock.now()} />,
    ),
  );
}

async function land(arriveAt: number) {
  deps.clock.set(arriveAt + 1000);
  await runTick(deps);
}

const hasNote = (s: GuestShown) =>
  s.kind === "live" && s.guest.note?.body === BODY;
const hasFlight = (s: GuestShown) => s.kind === "live";

beforeEach(async () => {
  deps = await makeTestDeps();
  world = await seedWorld(deps.db, deps.clock.now());
  seen = [];
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  vi.stubGlobal("fetch", serveGuestApi());
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { HTMLIFrameElement: class {} }),
  );
  root = createRoot(
    Object.assign(new EventTarget(), {
      nodeType: 1,
      tagName: "DIV",
      ownerDocument: new EventTarget(),
    }) as unknown as Element,
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Guest page after a report (docs/11 Abuse controls)", () => {
  it("hides the flight from the page once the report goes through", async () => {
    const { token } = await sendGuestFlight(deps, world, BODY);
    await open(token);
    expect(hasFlight(last().shown)).toBe(true);

    expect(await sendReport(token, "It's spam")).toBe(true);
    await act(async () => last().reported());

    expect(last().shown).toEqual({ kind: "reported" });
    await nextTick();
    expect(last().shown).toEqual({ kind: "reported" });
  });

  it("hides the note from the page when the report comes after landing", async () => {
    const { token, arriveAt } = await sendGuestFlight(deps, world, BODY);
    await land(arriveAt);
    await open(token);
    expect(hasNote(last().shown)).toBe(true);

    expect(await sendReport(token, "It's harassment")).toBe(true);
    await act(async () => last().reported());

    expect(hasNote(last().shown)).toBe(false);
    expect(hasFlight(last().shown)).toBe(false);
  });

  it("drops the page when another tab reported the link", async () => {
    const { token } = await sendGuestFlight(deps, world, BODY);
    await open(token);
    expect(await sendReport(token, "It's spam")).toBe(true);

    await nextTick();

    expect(last().shown).toEqual({ kind: "missing" });
  });

  it("shows the thanks page with no flight or note", () => {
    const html = renderToStaticMarkup(<GuestExpired kind="reported" />);
    expect(html).toContain("This link is closed and we will look at it.");
    expect(html).not.toContain("progressbar");
    expect(html).not.toContain(BODY);
  });
});

describe("Guest page expiry (docs/11 Timing rules)", () => {
  it("swaps an open landed link for the expired page once it expires", async () => {
    const { token, arriveAt } = await sendGuestFlight(deps, world, BODY);
    await land(arriveAt);
    await open(token);
    expect(hasNote(last().shown)).toBe(true);

    deps.clock.set(arriveAt + 7 * DAY_MS + 60_000);
    await nextTick();

    expect(last().shown).toEqual({ kind: "expired" });
    expect(hasNote(last().shown)).toBe(false);
  });

  it("opens the note on the page when the bird lands", async () => {
    const { token, arriveAt } = await sendGuestFlight(deps, world, BODY);
    await open(token);
    expect(hasNote(last().shown)).toBe(false);

    await land(arriveAt);
    await nextTick();

    expect(hasNote(last().shown)).toBe(true);
  });

  it("keeps the page when a refresh fails for a passing reason", async () => {
    const { token } = await sendGuestFlight(deps, world, BODY);
    await open(token);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 503 })),
    );

    await nextTick();

    expect(hasFlight(last().shown)).toBe(true);
  });
});
