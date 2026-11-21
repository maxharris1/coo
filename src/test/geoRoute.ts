import { NextRequest } from "next/server";
import { toE164, type E164 } from "@/lib/phone";
import { createJsonRoute } from "@/server/http";
import type { TestDeps } from "./deps";
import { FakeJar } from "./fakes/jar";

type Handler = (req: NextRequest) => Promise<Response>;

export function geoClient(
  deps: TestDeps,
  build: (jsonRoute: ReturnType<typeof createJsonRoute>) => Handler,
  path: string,
  jsonRoute = createJsonRoute(async () => deps),
) {
  const handler = build(jsonRoute);

  async function signIn(number: string, jar = new FakeJar()) {
    const id = await deps
      .auth(jar)
      .verifyCode(toE164(number) as E164, "000000");
    if (!id) throw new Error("test sign-in failed");
    return { id, jar };
  }

  const cookieHeader = (jar?: FakeJar) =>
    (jar?.getAll() ?? [])
      .map(({ name, value }) => `${name}=${value}`)
      .join("; ");

  async function get(query: Record<string, string>, jar?: FakeJar) {
    const cookie = cookieHeader(jar);
    const url = `https://coo.test${path}?${new URLSearchParams(query)}`;
    const res = await handler(new NextRequest(url, { headers: { cookie } }));
    return { status: res.status, json: await res.json() };
  }

  const send = (method: "POST" | "PATCH") =>
    async function (body: unknown, jar?: FakeJar) {
      const res = await handler(
        new NextRequest(`https://coo.test${path}`, {
          method,
          headers: {
            "content-type": "application/json",
            cookie: cookieHeader(jar),
          },
          body: JSON.stringify(body),
        }),
      );
      return { status: res.status, json: await res.json() };
    };

  async function del(jar?: FakeJar) {
    const res = await handler(
      new NextRequest(`https://coo.test${path}`, {
        method: "DELETE",
        headers: { cookie: cookieHeader(jar) },
      }),
    );
    return { status: res.status, json: await res.json() };
  }

  return { signIn, get, post: send("POST"), patch: send("PATCH"), del };
}
