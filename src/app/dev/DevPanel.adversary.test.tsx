import { act, type ReactElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { devClockPost } from "@/app/api/dev/clock/post";
import { SyncContext, type SyncState } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import type { UserId } from "@/server/ports/auth";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { devClockBuild, devClockRoute } from "@/test/devClockRoute";
import type { FakeJar } from "@/test/fakes/jar";
import { geoClient } from "@/test/geoRoute";
import { DevPanel } from "./DevPanel";

const view = vi.hoisted(() => ({ tree: null as ReactNode }));

vi.mock("./DevPanelView", async (actual) => {
  const real = await actual<typeof import("./DevPanelView")>();
  return {
    DevPanelView: (props: Parameters<typeof real.DevPanelView>[0]) => {
      view.tree = real.DevPanelView(props);
      return null;
    },
  };
});

type Props = { children?: ReactNode; role?: string; onClick?: () => void };

const HOUR = 3_600_000;

const elements = (node: ReactNode): ReactElement<Props>[] => {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!node || typeof node !== "object" || !("props" in node)) return [];
  const el = node as ReactElement<Props>;
  return [el, ...elements(el.props.children)];
};

const button = (label: string) => {
  const found = elements(view.tree).find(
    (el) => el.type === "button" && el.props.children === label,
  );
  if (!found) throw new Error(`no button labelled ${label}`);
  return found;
};

let deps: TestDeps;
let jar: FakeJar;
let root: Root;
let refresh: ReturnType<typeof vi.fn<() => void>>;
let statuses: number[];
let refs: string[];
let answered: Promise<unknown>;

async function click(label: string) {
  await act(async () => button(label).props.onClick!());
  await act(async () => {
    await answered;
  });
}

async function offset() {
  const [{ offset_ms }] = await deps.db.query<{ offset_ms: number }>(
    "select offset_ms from dev_clock",
  );
  return offset_ms;
}

beforeEach(async () => {
  deps = await makeTestDeps();
  await deps.db.query("update dev_clock set offset_ms = 0");
  const build = devClockBuild(deps);
  let builds = 0;
  const client = geoClient(
    deps,
    devClockPost,
    "/api/dev/clock",
    devClockRoute(deps, async () => {
      builds += 1;
      if (builds === 2) throw new Error("rebuild failed after commit");
      return build();
    }),
  );
  const session = await client.signIn("(555) 123-4567");
  jar = session.jar;
  await onboard(deps, session.id as UserId, {
    timezone: "America/New_York",
    name: "Max",
    bird: { name: "Gerald", look: "gerald", pronoun: "he" },
  });
  await deps.db.query(
    "update profiles set onboarded_at = to_timestamp($2 / 1000.0) where id = $1",
    [session.id, deps.clock.now()],
  );

  statuses = [];
  refs = [];
  refresh = vi.fn<() => void>();
  vi.stubGlobal(
    "fetch",
    vi.fn<typeof fetch>((_url, init) => {
      const body = JSON.parse(String(init?.body)) as { ref: string };
      refs.push(body.ref);
      const res = client.post(body, jar).then(({ status, json }) => {
        statuses.push(status);
        return Response.json(json, { status });
      });
      answered = res.then(() => new Promise((r) => setTimeout(r)));
      return res;
    }),
  );
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
  const sync: SyncState = {
    data: {
      serverNow: deps.clock.now(),
      flights: [],
    } as unknown as SyncPayload,
    error: null,
    offsetMs: 0,
    refresh,
  };
  await act(async () =>
    root.render(
      <SyncContext.Provider value={sync}>
        <DevPanel />
      </SyncContext.Provider>,
    ),
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

describe("DevPanel against the real clock route (ac-2)", () => {
  it("adversary: a +1 hour retried after a post-commit 500 moves the clock one hour", async () => {
    await click("+1 hour");
    expect(statuses).toEqual([500]);
    expect(await offset()).toBe(HOUR);
    expect(refresh).toHaveBeenCalledOnce();

    await click("+1 hour");
    expect(statuses).toEqual([500, 200]);
    expect(new Set(refs).size).toBe(1);
    expect(await offset()).toBe(HOUR);
    expect(refresh).toHaveBeenCalledTimes(2);

    await click("+1 hour");
    expect(new Set(refs).size).toBe(2);
    expect(await offset()).toBe(2 * HOUR);
  });
});
