import { NextResponse, type NextRequest } from "next/server";
import type { z } from "zod";
import {
  requireOnboarded,
  requireUser,
  type Caller,
  type OnboardedCaller,
  type Session,
} from "./auth";
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
  req: NextRequest;
};

export function createJsonRoute(build: () => Promise<Deps>) {
  return function jsonRoute<
    A extends Access,
    S extends z.ZodType | undefined = undefined,
    R extends object = object,
  >(
    access: A,
    opts: { body?: S },
    run: (ctx: Ctx<A, S>) => Promise<R>,
  ): (req: NextRequest) => Promise<NextResponse> {
    return async (req) => {
      const { jar, commit } = requestJar(req);
      let deps: Deps | undefined;
      try {
        checkOrigin(req);
        checkContentType(req, opts.body);
        deps = await build();
        const auth = deps.auth(jar);
        const caller = await CALLER[access]({ auth, db: deps.db });
        const input = opts.body ? await parseBody(req, opts.body) : undefined;
        const result = await run({
          deps,
          auth,
          jar,
          caller,
          input: input as Ctx<A, S>["input"],
          req,
        });
        return commit(
          NextResponse.json({ ...result, serverNow: deps.clock.now() }),
        );
      } catch (err) {
        const { status, body } = toErrorResponse(err, digitFreeRequestId());
        const payload = deps ? { ...body, serverNow: deps.clock.now() } : body;
        return commit(NextResponse.json(payload, { status }));
      }
    };
  };
}

export const jsonRoute = createJsonRoute(makeDeps);
