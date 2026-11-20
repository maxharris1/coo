import { describe, expect, it } from "vitest";
import { createInstallReporter } from "./reportInstalled";

type Call = { url: string; init?: RequestInit };

function fakeFetch(...outcomes: (number | Error)[]) {
  const calls: Call[] = [];
  const impl = (async (url: string, init?: RequestInit) => {
    if (url === "/api/auth/session" && !init?.method) {
      return Response.json({ userId: "u1", onboarded: true });
    }
    calls.push({ url, init });
    const next = outcomes.shift() ?? 200;
    if (next instanceof Error) throw next;
    return next === 200
      ? Response.json({ me: { id: "u1" } })
      : new Response("{}", { status: next });
  }) as typeof fetch;
  return { calls, impl };
}

const INSTALLED = {
  url: "/api/settings",
  init: {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ installed: true, account: "u1" }),
  },
};

describe("the installed reporter", () => {
  it("sends one PATCH while standalone, even when called twice at once and again later", async () => {
    const report = createInstallReporter();
    const { calls, impl } = fakeFetch(200);
    await Promise.all([report(true, impl), report(true, impl)]);
    await report(true, impl);
    expect(calls).toEqual([INSTALLED]);
  });

  it("sends nothing outside standalone mode", async () => {
    const report = createInstallReporter();
    const { calls, impl } = fakeFetch();
    await report(false, impl);
    await report(false, impl);
    expect(calls).toEqual([]);
  });

  it("retries after a refusal and stops once one succeeds", async () => {
    const report = createInstallReporter();
    const { calls, impl } = fakeFetch(409, 200);
    await report(true, impl);
    await report(true, impl);
    await report(true, impl);
    expect(calls).toEqual([INSTALLED, INSTALLED]);
  });

  it("retries after the network fails", async () => {
    const report = createInstallReporter();
    const { calls, impl } = fakeFetch(new TypeError("offline"), 200);
    await report(true, impl);
    await report(true, impl);
    await report(true, impl);
    expect(calls).toEqual([INSTALLED, INSTALLED]);
  });
});
