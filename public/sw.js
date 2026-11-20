const VERSION = "1";
const CACHE = `coo-${VERSION}-static`;
const OFFLINE_URL = "/offline";
const PRECACHE = [
  "/manifest.webmanifest",
  "/assets/app-icon/icon-192.png",
  "/assets/app-icon/icon-512.png",
  "/assets/app-icon/icon-maskable-512.png",
];

function classify(request) {
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    request.headers.has("range")
  ) {
    return "pass";
  }
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return "pass";
  if (request.headers.get("rsc") === "1" || url.searchParams.has("_rsc")) {
    return "pass";
  }
  if (request.mode === "navigate") return "page";
  if (url.pathname.startsWith("/_next/static/")) return "immutable";
  if (
    url.pathname.startsWith("/assets/") ||
    url.pathname === "/manifest.webmanifest"
  ) {
    return "revalidate";
  }
  return "pass";
}

async function precache() {
  const cache = await caches.open(CACHE);
  const offline = await fetch(OFFLINE_URL, { cache: "reload" });
  if (!offline.ok || offline.redirected) {
    throw new Error(`${OFFLINE_URL} answered ${offline.status}`);
  }
  const html = await offline.clone().text();
  const linked = html.match(/\/_next\/static\/[\w\-./~%]+/g) ?? [];
  await cache.addAll([...new Set([...PRECACHE, ...linked])]);
  await cache.put(OFFLINE_URL, offline);
}

async function store(request, response) {
  if (response.ok) {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

const strategies = {
  async page(event) {
    try {
      return await fetch(event.request);
    } catch {
      const cache = await caches.open(CACHE);
      return (await cache.match(OFFLINE_URL)) ?? Response.error();
    }
  },
  async immutable(event) {
    const cache = await caches.open(CACHE);
    return (
      (await cache.match(event.request)) ??
      store(event.request, await fetch(event.request))
    );
  },
  async revalidate(event) {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(event.request);
    const fresh = fetch(event.request).then((res) => store(event.request, res));
    event.waitUntil(fresh.catch(() => undefined));
    return cached ?? fresh;
  },
};

self.addEventListener("install", (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith("coo-") && name !== CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const kind = classify(event.request);
  if (kind !== "pass") event.respondWith(strategies[kind](event));
});
