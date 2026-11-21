import { afterEach, describe, expect, it, vi } from "vitest";
import {
  acceptAsk,
  browserPushClient,
  createResubscriber,
  shouldAsk,
  type PushClient,
} from "./push";

const UA = {
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  ipadDesktop:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
};

afterEach(() => vi.unstubAllGlobals());

function browser({
  ua = UA.iphone,
  touchPoints = 5,
  standalone = true,
  permission = "default" as NotificationPermission,
  supported = true,
} = {}) {
  vi.stubGlobal("window", {
    matchMedia: (query: string) => ({
      matches: query === "(display-mode: standalone)" && standalone,
    }),
    ...(supported && { PushManager: class {} }),
  });
  vi.stubGlobal("navigator", {
    userAgent: ua,
    maxTouchPoints: touchPoints,
    ...(supported && { serviceWorker: { ready: new Promise(() => {}) } }),
  });
  vi.stubGlobal(
    "Notification",
    supported ? { permission, requestPermission: vi.fn() } : undefined,
  );
  return browserPushClient();
}

describe("the ask sheet shows only where push can work (ac-1)", () => {
  it("shows on an installed iPhone that has not been asked by the browser", () => {
    expect(shouldAsk(browser())).toBe(true);
  });

  it("shows on an installed iPad that asks for desktop sites", () => {
    expect(shouldAsk(browser({ ua: UA.ipadDesktop }))).toBe(true);
  });

  it("does not show in a Safari tab on iOS", () => {
    expect(shouldAsk(browser({ standalone: false }))).toBe(false);
  });

  it("does not show on an installed Android app", () => {
    expect(shouldAsk(browser({ ua: UA.android, touchPoints: 5 }))).toBe(false);
  });

  it("does not show when permission is already granted or denied", () => {
    expect(shouldAsk(browser({ permission: "granted" }))).toBe(false);
    expect(shouldAsk(browser({ permission: "denied" }))).toBe(false);
  });

  it("does not show when the browser has no push support", () => {
    expect(shouldAsk(browser({ supported: false }))).toBe(false);
  });
});

const SUBSCRIPTION_JSON = {
  endpoint: "https://web.push.apple.com/abc",
  expirationTime: null,
  keys: { p256dh: "p256dh-key", auth: "auth-key" },
};

function fakeClient(
  overrides: Partial<PushClient> = {},
  existing: PushSubscription | null = null,
) {
  const subscribe = vi.fn(
    async (options?: PushSubscriptionOptionsInit) =>
      ({
        options,
        toJSON: () => SUBSCRIPTION_JSON,
      }) as unknown as PushSubscription,
  );
  const posts: { url: string; init?: RequestInit }[] = [];
  const client: PushClient = {
    ios: true,
    installed: true,
    permission: "default",
    requestPermission: vi.fn(async () => "granted" as const),
    pushManager: async () => ({
      getSubscription: async () => existing,
      subscribe,
    }),
    vapidKey: "AQID_-8",
    fetch: (async (url: string, init?: RequestInit) => {
      posts.push({ url, init });
      return Response.json({ ok: true });
    }) as typeof fetch,
    ...overrides,
  };
  return { client, subscribe, posts };
}

const POSTED = {
  url: "/api/push/subscribe",
  init: {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(SUBSCRIPTION_JSON),
  },
};

function subscribedKeys(subscribe: ReturnType<typeof fakeClient>["subscribe"]) {
  return subscribe.mock.calls.map(([options]) => ({
    userVisibleOnly: options?.userVisibleOnly,
    key: Array.from(
      new Uint8Array(options?.applicationServerKey as ArrayBufferLike),
    ),
  }));
}

describe("saying yes subscribes (ac-2)", () => {
  it("asks the browser, subscribes with the VAPID key and posts the subscription", async () => {
    const { client, subscribe, posts } = fakeClient();
    await acceptAsk(client);
    expect(client.requestPermission).toHaveBeenCalledTimes(1);
    expect(subscribedKeys(subscribe)).toEqual([
      { userVisibleOnly: true, key: [1, 2, 3, 255, 239] },
    ]);
    expect(posts).toEqual([POSTED]);
  });

  it("does nothing more when the browser prompt is refused", async () => {
    const { client, subscribe, posts } = fakeClient({
      requestPermission: async () => "denied",
    });
    await acceptAsk(client);
    expect(subscribe).not.toHaveBeenCalled();
    expect(posts).toEqual([]);
  });

  it("swallows a failed post", async () => {
    const { client } = fakeClient({
      fetch: (async () => {
        throw new TypeError("offline");
      }) as typeof fetch,
    });
    await expect(acceptAsk(client)).resolves.toBeUndefined();
  });
});

describe("launch re-subscribes when iOS dropped the subscription (ac-3)", () => {
  it("subscribes and posts once across repeated and concurrent launches", async () => {
    const resubscribe = createResubscriber();
    const { client, subscribe, posts } = fakeClient({ permission: "granted" });
    await Promise.all([resubscribe(client), resubscribe(client)]);
    await resubscribe(client);
    expect(subscribedKeys(subscribe)).toEqual([
      { userVisibleOnly: true, key: [1, 2, 3, 255, 239] },
    ]);
    expect(posts).toEqual([POSTED]);
  });

  it("does nothing while a subscription exists", async () => {
    const resubscribe = createResubscriber();
    const { client, subscribe, posts } = fakeClient(
      { permission: "granted" },
      {} as PushSubscription,
    );
    await resubscribe(client);
    expect(subscribe).not.toHaveBeenCalled();
    expect(posts).toEqual([]);
  });

  it("does nothing without granted permission or outside installed iOS", async () => {
    const resubscribe = createResubscriber();
    const cases = [
      fakeClient({ permission: "default" }),
      fakeClient({ permission: "granted", installed: false }),
      fakeClient({ permission: "granted", ios: false }),
    ];
    for (const { client } of cases) await resubscribe(client);
    expect(cases.flatMap(({ posts }) => posts)).toEqual([]);
  });

  it("tries again on a later launch after the network failed", async () => {
    const resubscribe = createResubscriber();
    const failing = fakeClient({
      permission: "granted",
      fetch: (async () => {
        throw new TypeError("offline");
      }) as typeof fetch,
    });
    await expect(resubscribe(failing.client)).resolves.toBeUndefined();
    const { client, posts } = fakeClient({ permission: "granted" });
    await resubscribe(client);
    expect(posts).toEqual([POSTED]);
  });
});
