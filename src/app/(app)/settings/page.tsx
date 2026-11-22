"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import { useToast } from "@/components/Toasts";
import type { Me } from "@/server/rows";
import { call } from "../friends/friendsApi";
import {
  NO_LOCATION,
  position,
  searchPlaces,
  type PlaceResult,
} from "../welcome/loft/roost";
import { SettingsView, type Change, type Sheet } from "./SettingsView";

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
  const [sheet, setSheet] = useState<Sheet>(null);
  const [places, setPlaces] = useState<PlaceResult[]>([]);

  if (!data) return <Loader />;
  const base = data;

  const patch = (body: Change | { name: string }) =>
    call(fetch, "/api/settings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, account: base.me.id }),
    });

  const onSave = async (change: Change) => {
    setHeld((h) => ({
      base,
      change: h.base === base ? { ...h.change, ...change } : change,
    }));
    const r = await patch(change);
    if (r.ok) {
      refresh();
      return;
    }
    toast(r.message);
    setHeld((h) =>
      h.base === base ? { base, change: without(h.change, change) } : h,
    );
  };

  const onRename = async (name: string) => {
    const r = await patch({ name });
    if (!r.ok) return r.message;
    refresh();
    return null;
  };

  const onSignOut = async () => {
    const r = await call(fetch, "/api/auth/sign-out", { method: "POST" });
    if (r.ok) router.push("/welcome");
    else toast(r.message);
  };

  const onSheet = (next: Sheet) => {
    setSheet(next);
    setPlaces([]);
  };

  const travel = async (body: object) => {
    const r = await call(fetch, "/api/loft/travel", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      toast(r.message);
      return;
    }
    refresh();
    onSheet(null);
  };

  const onTravel = async (on: boolean) => {
    if (!on) return travel({ on: false });
    const point = await position().catch(() => null);
    if (!point) return toast(NO_LOCATION);
    return travel({ on: true, ...point });
  };

  const onSearch = async (query: string) => {
    const q = query.trim();
    if (!q) return;
    const r = await searchPlaces(q);
    if (!r.ok) return toast(r.message);
    setPlaces(r.data.results);
    if (r.data.message) toast(r.data.message);
  };

  const onPlace = (placeId: string) => travel({ on: true, placeId });

  const onDelete = async (handle: string) => {
    const r = await call(fetch, "/api/account", {
      method: "DELETE",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: handle }),
    });
    if (r.ok) router.push("/welcome");
    else toast(r.message);
  };

  const me = held.base === data ? withChange(data.me, held.change) : data.me;
  return (
    <SettingsView
      me={me}
      sheet={sheet}
      places={places}
      onSave={onSave}
      onRename={onRename}
      onSignOut={onSignOut}
      onSheet={onSheet}
      onTravel={onTravel}
      onSearch={onSearch}
      onPlace={onPlace}
      onDelete={onDelete}
    />
  );
}
