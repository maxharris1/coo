import type { z } from "zod";
import { makeDeps, type Deps } from "./deps";
import { AppError, toErrorResponse } from "./errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function checkOrigin(req: Request): void {
  if (SAFE_METHODS.has(req.method)) return;
  const origin = req.headers.get("origin");
  if (origin !== null && origin !== new URL(req.url).origin) {
    throw new AppError("forbidden", "Cross-site request refused");
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

export function createHandler(build: () => Promise<Deps>) {
  return function handler<
    S extends z.ZodType | undefined = undefined,
    R extends object = object,
  >(
    opts: { body?: S },
    run: (
      deps: Deps,
      input: S extends z.ZodType ? z.infer<S> : undefined,
      req: Request,
    ) => Promise<R>,
  ): (req: Request) => Promise<Response> {
    return async (req) => {
      let built: Promise<Deps> | undefined;
      const deps = () => (built ??= build());
      try {
        checkOrigin(req);
        const d = await deps();
        const input = opts.body ? await parseBody(req, opts.body) : undefined;
        const result = await run(d, input as Parameters<typeof run>[1], req);
        return Response.json({ ...result, serverNow: d.clock.now() });
      } catch (err) {
        const { status, body } = toErrorResponse(err, crypto.randomUUID());
        const d = await deps().catch(() => undefined);
        if (!d) return Response.json(body, { status });
        return Response.json({ ...body, serverNow: d.clock.now() }, { status });
      }
    };
  };
}

export const handler = createHandler(makeDeps);
