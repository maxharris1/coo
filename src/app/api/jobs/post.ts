import { z } from "zod";
import type { createJsonRoute } from "@/server/http";
import { startJob } from "@/server/services/jobs/start";

const BODY = z
  .object({ jobId: z.string().min(1).max(64), birdId: z.uuid() })
  .strict();

export function jobsPost(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("onboarded", { body: BODY }, ({ deps, caller, input }) =>
    startJob(deps, caller, input),
  );
}
