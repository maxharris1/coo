import { expect, it } from "vitest";
import { requireOnboarded } from "@/server/auth";
import { loftPost } from "@/app/api/loft/post";
import { startJob } from "@/server/services/jobs/start";
import { offersFor } from "@/lib/game/jobs";
import { localDate } from "@/lib/game/time";
import { snap } from "@/lib/game/privacy";
import { jobGet } from "@/app/api/jobs/[id]/get";
import { makeTestDeps } from "./deps";
import { geoClient } from "./geoRoute";
import { seedWorld } from "./seedWorld";

it("returns snapped loft coordinates when owner chose town centre", async () => {
  const deps = await makeTestDeps();
  const world = await seedWorld(deps.db, deps.clock.now());
  const { jar } = await geoClient(deps, jobGet, "/api/jobs/x").signIn(
    "+15550000001",
  );
  const caller = await requireOnboarded({ db: deps.db, auth: deps.auth(jar) });
  const setup = await geoClient(deps, loftPost, "/api/loft").post(
    { lat: 40.7306, lon: -73.9866, centre: true },
    jar,
  );
  expect(setup.status).toBe(200);
  const offer = offersFor(
    caller.userId,
    localDate(deps.clock.now(), caller.profile.timezone),
  )[0];
  const { job } = await startJob(deps, caller, {
    jobId: offer.id,
    birdId: world.max.birds[0].id,
  });
  const { status, json } = await geoClient(
    deps,
    jobGet,
    `/api/jobs/${job.id}`,
  ).get({}, jar);
  expect(status).toBe(200);
  const { lat, lon } = json.job.map.loft;
  expect({ lat, lon }).toEqual(snap(lat, lon));
});
