import { isIos } from "@/lib/platform";

export type PushClient = {
  ios: boolean;
  installed: boolean;
  permission: NotificationPermission | null;
  requestPermission(): Promise<NotificationPermission>;
  pushManager(): Promise<Pick<PushManager, "getSubscription" | "subscribe">>;
  vapidKey: string;
  fetch: typeof fetch;
};

const canPush = (c: PushClient) =>
  c.ios && c.installed && c.permission !== null;

export const shouldAsk = (c: PushClient) =>
  canPush(c) && c.permission === "default";

function keyBytes(base64url: string) {
  const base64 = base64url
    .replace(/-/g, "+")
    .replace(/_/g, "/")
    .padEnd(Math.ceil(base64url.length / 4) * 4, "=");
  return Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
}

async function subscribe(
  c: PushClient,
  pushManager: Awaited<ReturnType<PushClient["pushManager"]>>,
) {
  const subscription = await pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes(c.vapidKey),
  });
  await c.fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(subscription.toJSON()),
  });
}

export async function acceptAsk(c: PushClient): Promise<void> {
  try {
    if ((await c.requestPermission()) !== "granted") return;
    await subscribe(c, await c.pushManager());
  } catch {
    return;
  }
}

export function createResubscriber() {
  let run: Promise<void> | null = null;

  async function resubscribe(c: PushClient) {
    const pushManager = await c.pushManager();
    if (await pushManager.getSubscription()) return;
    await subscribe(c, pushManager);
  }

  return function resubscribeOnLaunch(c: PushClient): Promise<void> {
    if (!canPush(c) || c.permission !== "granted") return Promise.resolve();
    run ??= resubscribe(c).catch(() => {
      run = null;
    });
    return run;
  };
}

export function browserPushClient(): PushClient {
  const nav = navigator as Navigator & { standalone?: boolean };
  const supported =
    "PushManager" in window &&
    typeof Notification !== "undefined" &&
    "serviceWorker" in nav;
  return {
    ios: isIos(nav),
    installed:
      window.matchMedia("(display-mode: standalone)").matches ||
      nav.standalone === true,
    permission: supported ? Notification.permission : null,
    requestPermission: () => Notification.requestPermission(),
    pushManager: async () => (await nav.serviceWorker.ready).pushManager,
    vapidKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
    // Called as c.fetch, which would bind `this` to the client and make the browser throw.
    fetch: (input, init) => fetch(input, init),
  };
}
