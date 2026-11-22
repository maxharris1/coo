import type { NextRequest } from "next/server";
import { z } from "zod";
import { AppError } from "@/server/errors";
import type { createJsonRoute } from "@/server/http";
import { getJob } from "@/server/services/jobs/get";

const JOB_ID = z.uuid();

function jobIdFrom(req: NextRequest): string {
  const segments = req.nextUrl.pathname.split("/");
  const parsed = JOB_ID.safeParse(segments[segments.indexOf("jobs") + 1]);
  if (!parsed.success) throw new AppError("not_found", "No such job");
  return parsed.data;
}

export function jobGet(jsonRoute: ReturnType<typeof createJsonRoute>) {
  return jsonRoute("onboarded", {}, async ({ deps, caller, req }) => ({
    job: await getJob(deps, caller.userId, jobIdFrom(req)),
  }));
}
