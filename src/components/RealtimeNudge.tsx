"use client";

import { useContext, useEffect } from "react";
import type { NotificationItem } from "@/server/services/notifications";
import { browserSupabase } from "@/server/supabase/browser";
import { SyncContext } from "./SyncProvider";
import { useToast } from "./Toasts";

const LANDED = new Set(["landed-in", "landed-out"]);
const toasted = new Map<string, Set<string>>();

async function fetchRealtimeToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/realtime/token", { cache: "no-store" });
    const { token } = (await res.json()) as { token?: unknown };
    return typeof token === "string" ? token : null;
  } catch {
    return null;
  }
}

async function fetchNewestUnread(): Promise<NotificationItem | null> {
  try {
    const res = await fetch("/api/notifications", { cache: "no-store" });
    const { notifications } = (await res.json()) as {
      notifications: NotificationItem[];
    };
    return notifications.find((n) => !n.read) ?? null;
  } catch {
    return null;
  }
}

export function RealtimeNudge() {
  const sync = useContext(SyncContext);
  const meId = sync?.data?.me.id;
  const refresh = sync?.refresh;
  const toast = useToast();

  useEffect(() => {
    if (!meId || !refresh) return;
    let active = true;
    const seen = toasted.get(meId) ?? new Set<string>();
    toasted.set(meId, seen);
    const toastLanding = async () => {
      const item = await fetchNewestUnread();
      if (!active || !item || !LANDED.has(item.kind) || seen.has(item.id))
        return;
      seen.add(item.id);
      toast(item.title);
    };
    const supabase = browserSupabase(fetchRealtimeToken);
    const channel = supabase
      .channel(`events:${meId}`)
      .on<{ kind: string }>(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "events",
          filter: `user_id=eq.${meId}`,
        },
        (payload) => {
          refresh();
          if (payload.new.kind === "notification") void toastLanding();
        },
      )
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [meId, refresh, toast]);

  return null;
}
