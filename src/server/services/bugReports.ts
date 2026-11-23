import { z } from "zod";
import type { Env } from "@/env";
import { ROUTE_MAX, VIEWPORT_MAX } from "@/lib/bugReportLimits";
import type { Deps } from "@/server/deps";
import { log } from "@/server/log";
import type { UserId } from "@/server/ports/auth";
import { rateLimit } from "@/server/rateLimit";

const USER_AGENT_MAX = 300;
const BUILD_LENGTH = 12;
const HOUR_SECONDS = 3600;
const SECRET_SEGMENTS: Record<string, string> = { b: "[slug]", join: "[code]" };

const stripNul = (text: string) => text.replaceAll("\u0000", "");

const cut = (text: string, max: number) =>
  text.slice(0, max).replace(/[\ud800-\udbff]$/, "");

export const bugReportInput = z
  .object({
    clientKey: z.uuid(),
    body: z
      .string()
      .transform(stripNul)
      .pipe(z.string().trim().min(1).max(2000)),
    context: z
      .object({
        route: z.string().max(ROUTE_MAX),
        standalone: z.boolean(),
        viewport: z
          .object({
            w: z.int().min(1).max(VIEWPORT_MAX),
            h: z.int().min(1).max(VIEWPORT_MAX),
          })
          .strict(),
        timeZone: z
          .string()
          .max(64)
          .regex(/^[^\u0000-\u001f\u007f]*$/)
          .refine((zone) => zone.isWellFormed()),
      })
      .strict(),
  })
  .strict();

export type BugReportInput = z.infer<typeof bugReportInput>;

export type ServerContext = {
  userAgent: string;
  build: string;
  appEnv: Env["APP_ENV"];
};

export function cleanRoute(raw: string): string {
  const path = stripNul(raw).toWellFormed().split(/[?#]/, 1)[0];
  if (!path.startsWith("/")) return "unknown";
  const segments = path.split("/");
  const secret = SECRET_SEGMENTS[segments[1]];
  if (secret && segments.length > 2) segments[2] = secret;
  return cut(segments.join("/"), ROUTE_MAX);
}

export function cleanUserAgent(raw: string | null): string {
  return cut((raw ?? "").replace(/[\u0000-\u001f\u007f]/g, ""), USER_AGENT_MAX);
}

export function buildLabel(sha: string | undefined): string {
  return sha ? sha.slice(0, BUILD_LENGTH) : "dev";
}

export async function fileBugReport(
  deps: Deps,
  me: UserId,
  input: BugReportInput,
  server: ServerContext,
): Promise<{ id: string }> {
  const { route, standalone, viewport, timeZone } = input.context;
  const context = {
    route: cleanRoute(route),
    standalone,
    viewport: { w: viewport.w, h: viewport.h },
    timeZone,
    userAgent: server.userAgent,
    build: server.build,
    appEnv: server.appEnv,
  };

  const id = await deps.db.tx(async (db) => {
    await db.query("select 1 from profiles where id = $1 for update", [me]);
    const [prior] = await db.query<{ id: string }>(
      "select id from bug_reports where user_id = $1 and client_key = $2",
      [me, input.clientKey],
    );
    if (prior) return prior.id;

    await rateLimit(
      db,
      deps.clock,
      `bug-reports:${me}`,
      deps.config.game.limits.bugReportsPerHour,
      HOUR_SECONDS,
    );
    const [row] = await db.query<{ id: string }>(
      `insert into bug_reports (user_id, client_key, body, context, created_at)
       values ($1, $2, $3, $4, $5) returning id`,
      [
        me,
        input.clientKey,
        input.body,
        JSON.stringify(context),
        new Date(deps.clock.now()).toISOString(),
      ],
    );
    return row.id;
  });

  log.info("bug_report.filed", { reportId: id, userId: me });
  return { id };
}
