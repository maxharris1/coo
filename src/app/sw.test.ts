import { existsSync, readFileSync } from "node:fs";
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

type FakeWindow = {
  url: string;
  focused: boolean;
  navigatedTo?: string;
  focus: () => Promise<FakeWindow>;
  navigate: (url: string) => Promise<FakeWindow>;
};

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

  const shown: { title: string; options: NotificationOptions }[] = [];
  const windows: FakeWindow[] = [];
  const opened: string[] = [];
  function openWindowAt(url: string) {
    const win: FakeWindow = {
      url: new URL(url, ORIGIN).href,
      focused: false,
      async focus() {
        win.focused = true;
        return win;
      },
      async navigate(to: string) {
        win.navigatedTo = new URL(to, ORIGIN).href;
        return win;
      },
    };
    windows.push(win);
    return win;
  }

  const listeners = new Map<string, Handler>();
  const self = {
    location: new URL(`${ORIGIN}/sw.js`),
    addEventListener: (type: string, fn: Handler) => listeners.set(type, fn),
    skipWaiting: async () => {},
    registration: {
      showNotification: async (title: string, options: NotificationOptions) => {
        shown.push({ title, options });
      },
    },
    clients: {
      claim: async () => {},
      matchAll: async (options: {
        type?: string;
        includeUncontrolled?: boolean;
      }) =>
        options.type === "window" && options.includeUncontrolled
          ? [...windows]
          : [],
      openWindow: async (url: string) => {
        opened.push(new URL(url, ORIGIN).href);
        return null;
      },
    },
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

  async function push(payload: unknown) {
    const waits: Promise<unknown>[] = [];
    listeners.get("push")!({
      data: { json: () => payload },
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    await Promise.all(waits);
  }

  async function click(data: unknown) {
    const waits: Promise<unknown>[] = [];
    const notification = {
      data,
      closed: false,
      close() {
        notification.closed = true;
      },
    };
    listeners.get("notificationclick")!({
      notification,
      waitUntil: (p: Promise<unknown>) => waits.push(p),
    });
    await Promise.all(waits);
    return notification;
  }

  return {
    network,
    store,
    cacheOps,
    lifecycle,
    request,
    listeners,
    push,
    click,
    shown,
    windows,
    opened,
    openWindowAt,
  };
}

let sw: ReturnType<typeof harness>;

beforeEach(async () => {
  sw = harness();
  await sw.lifecycle("install");
  await sw.lifecycle("activate");
});

describe("public/sw.js", () => {
  it("registers install, activate, fetch, push and notificationclick listeners", () => {
    expect([...sw.listeners.keys()].sort()).toEqual([
      "activate",
      "fetch",
      "install",
      "notificationclick",
      "push",
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

  it("shows a push as a notification with its title, body and tag, the 192 icon and the mono badge", async () => {
    await sw.push({
      title: "Pip landed",
      body: "A note from Sam is waiting.",
      url: "/notes/n1",
      tag: "landed-in:f1",
    });
    expect(sw.shown).toEqual([
      {
        title: "Pip landed",
        options: {
          body: "A note from Sam is waiting.",
          tag: "landed-in:f1",
          data: { url: "/notes/n1" },
          icon: "/assets/app-icon/icon-192.png",
          badge: "/assets/app-icon/icon-mono-96.png",
        },
      },
    ]);
  });

  it("points the push icon and badge at files that exist", () => {
    for (const file of ["icon-192.png", "icon-mono-96.png"]) {
      expect(
        existsSync(
          new URL(`../../public/assets/app-icon/${file}`, import.meta.url),
        ),
        file,
      ).toBe(true);
    }
  });

  it("focuses an open window and navigates it to the url on click", async () => {
    const win = sw.openWindowAt("/");
    const notification = await sw.click({ url: "/notes/n1" });
    expect(notification.closed).toBe(true);
    expect(win.focused).toBe(true);
    expect(win.navigatedTo).toBe(`${ORIGIN}/notes/n1`);
    expect(sw.opened).toEqual([]);
  });

  it("opens a window at the url on click when none is open", async () => {
    const notification = await sw.click({ url: "/notes/n1" });
    expect(notification.closed).toBe(true);
    expect(sw.opened).toEqual([`${ORIGIN}/notes/n1`]);
  });
});
