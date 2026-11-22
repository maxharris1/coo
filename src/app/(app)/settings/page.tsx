"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import { useToast } from "@/components/Toasts";
import type { Me } from "@/server/rows";
import { call } from "../friends/friendsApi";
import { SettingsView, type Change } from "./SettingsView";

type Held = { base: SyncPayload | null; change: Change };

function withChange(me: Me, { units, ...settings }: Change): Me {
  return {
    ...me,
    units: units ?? me.units,
    settings: { ...me.settings, ...settings },
  };
}

function without(change: Change, keys: Change): Change {
  return Object.fromEntries(
    Object.entries(change).filter(([k]) => !(k in keys)),
  );
}

export default function SettingsPage() {
  const { data, refresh } = useSync();
  const toast = useToast();
  const router = useRouter();
  const [held, setHeld] = useState<Held>({ base: null, change: {} });

  if (!data) return <Loader />;
  const base = data;

  const onSave = async (change: Change) => {
    setHeld((h) => ({
      base,
      change: h.base === base ? { ...h.change, ...change } : change,
    }));
    const r = await call(fetch, "/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...change, account: base.me.id }),
    });
    if (r.ok) {
      refresh();
      return;
    }
    toast(r.message);
    setHeld((h) =>
      h.base === base ? { base, change: without(h.change, change) } : h,
    );
  };

  const onSignOut = async () => {
    const r = await call(fetch, "/api/auth/sign-out", { method: "POST" });
    if (r.ok) router.push("/welcome");
    else toast(r.message);
  };

  const me = held.base === data ? withChange(data.me, held.change) : data.me;
  return <SettingsView me={me} onSave={onSave} onSignOut={onSignOut} />;
}
