import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import { readAppEnv, type Env } from "@/env";
import {
  requireOnboarded,
  requireUser,
  type Caller,
  type OnboardedCaller,
  type Session,
} from "./auth";
import { systemClock } from "./clock";
import { makeDeps, type Deps } from "./deps";
import { AppError, toErrorResponse } from "./errors";
import type { AuthPort, SessionJar } from "./ports/auth";
import { requestJar } from "./supabase/cookies";

export type Access = "public" | "user" | "onboarded";
type CallerFor = { public: null; user: Caller; onboarded: OnboardedCaller };

const CALLER: { [A in Access]: (s: Session) => Promise<CallerFor[A]> } = {
  public: async () => null,
  user: requireUser,
  onboarded: requireOnboarded,
};

const digitFreeRequestId = () =>
  crypto.randomUUID().replace(/\d/g, (d) => "ghijklmnop"[Number(d)]);

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function checkOrigin(req: Request): void {
  if (SAFE_METHODS.has(req.method)) return;
  const origin = req.headers.get("origin");
  if (origin !== null && origin !== new URL(req.url).origin) {
    throw new AppError("forbidden", "Cross-site request refused");
  }
}

const JSON_CONTENT_TYPE = /^application\/json\s*(;|$)/i;

function checkContentType(req: Request, schema: z.ZodType | undefined): void {
  if (!schema || req.method === "GET" || req.method === "HEAD") return;
  if (!JSON_CONTENT_TYPE.test(req.headers.get("content-type") ?? "")) {
    throw new AppError("invalid", "body must be application/json");
  }
}

async function parseBody<S extends z.ZodType>(
  req: Request,
  schema: S,
): Promise<z.infer<S>> {
  const raw: unknown = await req.json().catch(() => {
    throw new AppError("invalid", "body is not valid JSON");
  });
  return parseInput(schema, raw);
}

export function parseQuery<S extends z.ZodType>(
  req: NextRequest,
  schema: S,
): z.infer<S> {
  return parseInput(schema, Object.fromEntries(req.nextUrl.searchParams));
}

function parseInput<S extends z.ZodType>(schema: S, raw: unknown): z.infer<S> {
  const result = schema.safeParse(raw);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const field = issue.path.length > 0 ? issue.path.join(".") : "body";
  throw new AppError("invalid", `${field}: ${issue.message}`);
}

type Ctx<A extends Access, S> = {
  deps: Deps;
  auth: AuthPort;
  jar: SessionJar;
  caller: CallerFor[A];
  input: S extends z.ZodType ? z.infer<S> : undefined;
  params: Record<string, string>;
  req: NextRequest;
  rebuild: () => Promise<Deps>;
};

type RouteArg = { params: Promise<Record<string, string>> };

type Build = () => Promise<Deps>;

export function createJsonRoute(
  build: Build,
  gate: { appEnv?: () => Env["APP_ENV"] | undefined } = {},
) {
  const devAllowed = () => {
    const env = gate.appEnv?.();
    return env !== undefined && env !== "production";
  };
  return function jsonRoute<
    A extends Access,
    S extends z.ZodType | undefined = undefined,
    R extends object = object,
  >(
    access: A,
    opts: { body?: S; devOnly?: true },
    run: (ctx: Ctx<A, S>) => Promise<R>,
  ): (req: NextRequest, route?: RouteArg) => Promise<NextResponse> {
    return async (req, route) => {
      const { jar, commit } = requestJar(req);
      let deps: Deps | undefined;
      try {
        if (opts.devOnly && !devAllowed()) {
          throw new AppError("not_found", "Not found");
        }
        checkOrigin(req);
        checkContentType(req, opts.body);
        deps = await build();
        const auth = deps.auth(jar);
        const caller = await CALLER[access]({ auth, db: deps.db });
        const input = opts.body ? await parseBody(req, opts.body) : undefined;
        const params = (await route?.params) ?? {};
        const result = await run({
          deps,
          auth,
          jar,
          caller,
          input: input as Ctx<A, S>["input"],
          params,
          req,
          rebuild: async () => {
            deps = await build();
            return deps;
          },
        });
        return commit(
          NextResponse.json({ ...result, serverNow: deps.clock.now() }),
        );
      } catch (err) {
        const { status, body } = toErrorResponse(err, digitFreeRequestId());
        const clock = deps?.clock ?? systemClock;
        return commit(
          NextResponse.json({ ...body, serverNow: clock.now() }, { status }),
        );
      }
    };
  };
}

export const jsonRoute = createJsonRoute(makeDeps, {
  appEnv: () => readAppEnv(process.env),
});
