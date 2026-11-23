import { ROUTE_MAX, VIEWPORT_MAX } from "@/lib/bugReportLimits";

export type BugContext = {
  route: string;
  standalone: boolean;
  viewport: { w: number; h: number };
  timeZone: string;
};

export type SendFailure = "rate_limited" | "invalid" | "offline" | "unknown";

export type SendResult = { ok: true } | { ok: false; reason: SendFailure };

export type ReportSender = {
  send(text: string, context: BugContext): Promise<SendResult> | null;
};

const side = (px: number) =>
  Math.min(VIEWPORT_MAX, Math.max(1, Math.round(px)));

export function readContext(
  route: string,
  win: Pick<Window, "innerWidth" | "innerHeight" | "matchMedia" | "navigator">,
): BugContext {
  return {
    route: route.slice(0, ROUTE_MAX),
    standalone:
      win.matchMedia("(display-mode: standalone)").matches ||
      (win.navigator as Navigator & { standalone?: boolean }).standalone ===
        true,
    viewport: { w: side(win.innerWidth), h: side(win.innerHeight) },
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  };
}

async function failureOf(res: Response): Promise<SendFailure> {
  if (res.status === 429) return "rate_limited";
  const code = await res.json().then(
    (json: { error?: { code?: unknown } } | null) => json?.error?.code,
    () => undefined,
  );
  return code === "rate_limited" || code === "invalid" ? code : "unknown";
}

export function createReportSender(
  fetchImpl: typeof fetch,
  newKey: () => string,
): ReportSender {
  let clientKey = newKey();
  let inFlight = false;

  async function post(text: string, context: BugContext): Promise<SendResult> {
    let res: Response;
    try {
      res = await fetchImpl("/api/bug-reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientKey, body: text.trim(), context }),
      });
    } catch {
      return { ok: false, reason: "offline" };
    }
    if (!res.ok) return { ok: false, reason: await failureOf(res) };
    clientKey = newKey();
    return { ok: true };
  }

  return {
    send(text, context) {
      if (inFlight) return null;
      inFlight = true;
      return post(text, context).finally(() => {
        inFlight = false;
      });
    },
  };
}
