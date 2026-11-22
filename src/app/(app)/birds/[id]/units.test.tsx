import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { syncGet } from "@/app/api/sync/get";
import { settingsPatch } from "@/app/api/settings/patch";
import type { SyncState } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import type { UserId } from "@/server/ports/auth";
import { onboard } from "@/server/services/onboarding";
import { makeTestDeps, type TestDeps } from "@/test/deps";
import { geoClient } from "@/test/geoRoute";
import PigeonPage from "./page";

const sync = vi.hoisted(() => ({ current: null as unknown }));
const params = vi.hoisted(() => ({ id: "" }));

vi.mock("@/components/SyncProvider", () => ({ useSync: () => sync.current }));
vi.mock("@/components/Toasts", () => ({ useToast: () => () => {} }));
vi.mock("next/navigation", () => ({ useParams: () => params }));

let deps: TestDeps;

beforeEach(async () => {
  deps = await makeTestDeps();
});

async function onboarded() {
  const settings = geoClient(deps, settingsPatch, "/api/settings");
  const session = await settings.signIn("(555) 123-4567");
  await onboard(deps, session.id as UserId, {
    timezone: "America/New_York",
    name: "Max",
    bird: { name: "Gerald", look: "gerald", pronoun: "he" },
  });
  await deps.db.query(
    "update profiles set onboarded_at = to_timestamp($2 / 1000.0) where id = $1",
    [session.id, deps.clock.now()],
  );
  return { ...session, settings };
}

const range = (html: string) =>
  />Range before a rest<\/span><span[^>]*>([^<]*)</.exec(html)?.[1];

describe("bird detail range after a units change (ac-2)", () => {
  it.each([
    ["km", "515 kilometres"],
    ["mi", "320 miles"],
  ])(
    "PATCH units %s, then sync, shows the range as %s",
    async (units, expected) => {
      const { id, jar, settings } = await onboarded();
      if (units === "mi") {
        await settings.patch({ units: "km", account: id }, jar);
      }
      const patched = await settings.patch({ units, account: id }, jar);
      expect(patched.status).toBe(200);

      const synced = await geoClient(deps, syncGet, "/api/sync").get({}, jar);
      expect(synced.status).toBe(200);
      const data = synced.json as SyncPayload;
      expect(data.me.units).toBe(units);

      const gerald = data.birds.find((b) => b.name === "Gerald");
      if (!gerald) throw new Error("no Gerald in sync");
      expect(gerald.speedMph).toBe(45);
      params.id = gerald.id;
      sync.current = {
        data,
        error: null,
        offsetMs: 0,
        refresh: () => {},
      } satisfies SyncState;

      expect(range(renderToStaticMarkup(<PigeonPage />))).toBe(expected);
    },
  );
});
