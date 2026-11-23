import type { Env } from "@/env";
import type { createJsonRoute } from "@/server/http";
import {
  bugReportInput,
  cleanUserAgent,
  fileBugReport,
} from "@/server/services/bugReports";

export function bugReportsPost(
  jsonRoute: ReturnType<typeof createJsonRoute>,
  server: () => { build: string; appEnv: Env["APP_ENV"] },
) {
  return jsonRoute(
    "onboarded",
    { body: bugReportInput },
    ({ deps, caller, input, req }) =>
      fileBugReport(deps, caller.userId, input, {
        ...server(),
        userAgent: cleanUserAgent(req.headers.get("user-agent")),
      }),
  );
}
