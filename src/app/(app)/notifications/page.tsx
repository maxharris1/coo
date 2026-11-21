"use client";

import { useEffect, useState } from "react";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { useToast } from "@/components/Toasts";
import type { NotificationItem } from "@/server/services/notifications";
import { NotificationsView, type ScreenState } from "./NotificationsView";

const UNREACHABLE = "We could not reach the loft. Try again.";

type Result = { ok: true; json: unknown } | { ok: false; message: string };

async function call(path: string, init?: RequestInit): Promise<Result> {
  try {
    const res = await fetch(path, { cache: "no-store", ...init });
    const json: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, json };
    const message = (json as { error?: { message?: unknown } } | null)?.error
      ?.message;
    return {
      ok: false,
      message: typeof message === "string" && message ? message : UNREACHABLE,
    };
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
}

export default function NotificationsPage() {
  const { data, refresh } = useSync();
  const toast = useToast();
  const [state, setState] = useState<ScreenState>({ kind: "loading" });

  useEffect(() => {
    let live = true;
    void (async () => {
      const list = await call("/api/notifications");
      if (!live) return;
      if (!list.ok) {
        setState({ kind: "failed" });
        toast(list.message);
        return;
      }
      const { notifications } = list.json as {
        notifications: NotificationItem[];
      };
      setState({ kind: "ready", items: notifications });
      const read = await call("/api/notifications/read", { method: "POST" });
      if (read.ok) refresh();
      else if (live) toast(read.message);
    })();
    return () => {
      live = false;
    };
  }, [toast, refresh]);

  if (!data) return <Loader />;
  return <NotificationsView state={state} timezone={data.me.timezone} />;
}
