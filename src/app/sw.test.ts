import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { beforeEach, describe, expect, it } from "vitest";

const ORIGIN = "https://coo.test";
const source = readFileSync(
  new URL("../../public/sw.js", import.meta.url),
  "utf8",
);

const OFFLINE_HTML =
  '<html><link rel="stylesheet" href="/_next/static/css/shell.css"><script src="/_next/static/chunks/main.js"></script><body>offline shell</body></html>';

type Handler = (event: unknown) => void;
type Route = () => Response;

function harness() {
  const network = {
    online: true,
    calls: [] as string[],
    routes: new Map<string, Route>([
      ["/offline", () => new Response(OFFLINE_HTML)],
      ["/manifest.webmanifest", () => new Response("{}")],
      ["/_next/static/css/shell.css", () => new Response("body{}")],
      ["/_next/static/chunks/main.js", () => new Response("main()")],
      ["/_next/static/chunks/page.js", () => new Response("page()")],
      ["/", () => new Response("home page")],
      ["/api/me", () => new Response('{"me":1}')],
    ]),
  };
  for (const size of ["icon-192", "icon-512", "icon-maskable-512"]) {
    network.routes.set(
      `/assets/app-icon/${size}.png`,
      () => new Response("png"),
    );
  }

  const keyOf = (req: Request | string) =>
    new URL(typeof req === "string" ? req : req.url, ORIGIN).href;

  async function fetchFake(input: Request | string) {
    const url = new URL(keyOf(input));
    network.calls.push(url.pathname);
    if (!network.online) throw new TypeError("Failed to fetch");
    const route = network.routes.get(url.pathname);
    return route ? route() : new Response("missing", { status: 404 });
  }

  const store = new Map<string, Map<string, Response>>();
  const cacheOps: string[] = [];
  function openSync(name: string) {
    if (!store.has(name)) store.set(name, new Map());
    const entries = store.get(name)!;
    return {
      async match(req: Request | string) {
        cacheOps.push(`match ${keyOf(req)}`);
        return entries.get(keyOf(req))?.clone();
      },
      async put(req: Request | string, res: Response) {
        cacheOps.push(`put ${keyOf(req)}`);
        entries.set(keyOf(req), res);
      },
      async addAll(reqs: string[]) {
        const responses = await Promise.all(reqs.map((r) => fetchFake(r)));
        if (responses.some((r) => !r.ok)) throw new TypeError("addAll failed");
        reqs.forEach((r, i) => entries.set(keyOf(r), responses[i]));
      },
    };
  }
  const caches = {
    open: async (name: string) => openSync(name),
    keys: async () => [...store.keys()],
    delete: async (name: string) => store.delete(name),
    match: async (req: Request | string) => {
      for (const entries of store.values()) {
        const hit = entries.get(keyOf(req));
        if (hit) return hit.clone();
      }
      return undefined;
    },
  };

  const listeners = new Map<string, Handler>();
  const self = {
    location: new URL(`${ORIGIN}/sw.js`),
    addEventListener: (type: string, fn: Handler) => listeners.set(type, fn),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  runInNewContext(source, {
    self,
    caches,
    fetch: fetchFake,
    URL,
    Response,
  });

  async function lifecycle(type: "install" | "activate") {
    const waits: Promise<unknown>[] = [];
    listeners.get(type)!({ waitUntil: (p: Promise<unknown>) => waits.push(p) });
    await Promise.all(waits);
  }

  async function request(
    path: string,
    init: RequestInit & { navigate?: boolean } = {},
  ) {
    const request = new Request(new URL(path, ORIGIN), init);
    if (init.navigate)
      Object.defineProperty(request, "mode", { value: "navigate" });
    let responded: Promise<Response> | undefined;
    const waits: Promise<unknown>[] = [];
    listeners.get("fetch")!({
      request,
      respondWith: (p: Promise<Response>) => (responded = p),
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    const response = responded ? await responded : undefined;
    await Promise.all(waits);
    return response;
  }

  return { network, store, cacheOps, lifecycle, request, listeners };
}

let sw: ReturnType<typeof harness>;

beforeEach(async () => {
  sw = harness();
  await sw.lifecycle("install");
  await sw.lifecycle("activate");
});

describe("public/sw.js", () => {
  it("registers install, activate and fetch listeners", () => {
    expect([...sw.listeners.keys()].sort()).toEqual([
      "activate",
      "fetch",
      "install",
    ]);
  });

  it("caches into one versioned coo cache", () => {
    expect([...sw.store.keys()]).toHaveLength(1);
    expect([...sw.store.keys()][0]).toMatch(/^coo-.+-static$/);
  });

  it("serves the precached offline shell for any page once the network is off", async () => {
    sw.network.online = false;
    for (const path of ["/", "/flights", "/welcome/bird"]) {
      const res = await sw.request(path, { navigate: true });
      expect(await res!.text()).toBe(OFFLINE_HTML);
    }
  });

  it("precaches the static files the offline shell links so it renders offline", async () => {
    sw.network.online = false;
    for (const path of [
      "/_next/static/css/shell.css",
      "/_next/static/chunks/main.js",
      "/manifest.webmanifest",
      "/assets/app-icon/icon-192.png",
    ]) {
      const res = await sw.request(path);
      expect(res?.ok, path).toBe(true);
    }
  });

  it("goes to the network first for pages and never stores them", async () => {
    const before = sw.cacheOps.length;
    const res = await sw.request("/", { navigate: true });
    expect(await res!.text()).toBe("home page");
    sw.network.online = false;
    const offline = await sw.request("/", { navigate: true });
    expect(await offline!.text()).toBe(OFFLINE_HTML);
    expect(
      sw.cacheOps.slice(before).filter((op) => op.startsWith("put")),
    ).toEqual([]);
  });

  it("keeps a hashed static file it fetched online for later offline use", async () => {
    await sw.request("/_next/static/chunks/page.js");
    sw.network.online = false;
    const res = await sw.request("/_next/static/chunks/page.js");
    expect(await res!.text()).toBe("page()");
  });

  it.each([true, false])(
    "never answers an API call or touches a cache for it (online: %s)",
    async (online) => {
      sw.network.online = online;
      const before = sw.cacheOps.length;
      expect(await sw.request("/api/me")).toBeUndefined();
      expect(await sw.request("/api")).toBeUndefined();
      expect(
        await sw.request("/api/notes", { method: "POST", body: "{}" }),
      ).toBeUndefined();
      expect(sw.cacheOps.slice(before)).toEqual([]);
      expect(sw.network.calls).not.toContain("/api/me");
    },
  );

  it("leaves React Server Component fetches, other origins and non-GETs to the browser", async () => {
    expect(
      await sw.request("/flights", { headers: { RSC: "1" } }),
    ).toBeUndefined();
    expect(await sw.request("/flights?_rsc=abc")).toBeUndefined();
    expect(await sw.request("https://tiles.example/1/2/3.png")).toBeUndefined();
    expect(
      await sw.request("/assets/x.png", { method: "POST", body: "" }),
    ).toBeUndefined();
  });

  it("deletes old coo caches on activate and keeps the current one", async () => {
    sw.store.set("coo-old-static", new Map());
    sw.store.set("someone-else", new Map());
    const current = [...sw.store.keys()][0];
    await sw.lifecycle("activate");
    expect([...sw.store.keys()].sort()).toEqual(
      [current, "someone-else"].sort(),
    );
  });

  it("fails install when /offline redirects instead of rendering", async () => {
    const fresh = harness();
    fresh.network.routes.set("/offline", () => {
      const res = new Response("sign in");
      Object.defineProperty(res, "redirected", { value: true });
      return res;
    });
    await expect(fresh.lifecycle("install")).rejects.toThrow();
  });
});
