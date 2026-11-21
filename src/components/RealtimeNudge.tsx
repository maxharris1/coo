"use client";

import { useContext, useEffect } from "react";
import { browserSupabase } from "@/server/supabase/browser";
import { SyncContext } from "./SyncProvider";

async function fetchRealtimeToken(): Promise<string | null> {
  try {
    const res = await fetch("/api/realtime/token", { cache: "no-store" });
    const { token } = (await res.json()) as { token?: unknown };
    return typeof token === "string" ? token : null;
  } catch {
    return null;
  }
}

export function RealtimeNudge() {
  const sync = useContext(SyncContext);
  const meId = sync?.data?.me.id;
  const refresh = sync?.refresh;

  useEffect(() => {
    if (!meId || !refresh) return;
    const supabase = browserSupabase(fetchRealtimeToken);
    const channel = supabase
      .channel(`events:${meId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "events",
          filter: `user_id=eq.${meId}`,
        },
        () => refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [meId, refresh]);

  return null;
}
