import { getEnv } from "@/env";
import { jsonRoute } from "@/server/http";
import { buildLabel } from "@/server/services/bugReports";
import { bugReportsPost } from "./post";

export const POST = bugReportsPost(jsonRoute, () => {
  const env = getEnv();
  return { build: buildLabel(env.VERCEL_GIT_COMMIT_SHA), appEnv: env.APP_ENV };
});
