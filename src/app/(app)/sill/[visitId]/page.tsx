"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { useToast } from "@/components/Toasts";
import type { FriendRow } from "@/server/services/friends";
import type { SyncVisit } from "@/server/services/visits/syncRead";
import { GoneHome, Landed } from "../Landed";
import { landedState, type SenderCity } from "../landedModel";

type Departed = { birdName: string; ownerId: string };

const TICK_MS = 1000;
const UNREACHABLE = "We could not reach the loft. Try again.";
const departedKey = (id: string) => `coo.sill.departed.${id}`;
const landedKey = (id: string) => `coo.sill.landed.${id}`;

function bestEffort<T>(run: () => T, fallback: T): T {
  try {
    return run();
  } catch {
    return fallback;
  }
}

function remember(visit: SyncVisit) {
  const departed: Departed = {
    birdName: visit.bird.name,
    ownerId: visit.owner.id,
  };
  bestEffort(
    () =>
      sessionStorage.setItem(departedKey(visit.id), JSON.stringify(departed)),
    undefined,
  );
}

function recall(id: string): Departed | null {
  return bestEffort(() => {
    const raw = sessionStorage.getItem(departedKey(id));
    return raw ? (JSON.parse(raw) as Departed) : null;
  }, null);
}

const landedBefore = (id: string) =>
  bestEffort(() => localStorage.getItem(landedKey(id)) !== null, false);
const markLanded = (id: string) =>
  bestEffort(() => localStorage.setItem(landedKey(id), "1"), undefined);

const reducedMotion = () =>
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function sharedCity(friend: FriendRow | undefined): SenderCity | null {
  if (!friend || friend.theyShow !== "city" || !friend.where) return null;
  const cut = friend.where.lastIndexOf(", ");
  return cut < 0
    ? { name: friend.where, region: null }
    : { name: friend.where.slice(0, cut), region: friend.where.slice(cut + 2) };
}

async function senderCity(ownerId: string): Promise<SenderCity | null> {
  try {
    const res = await fetch("/api/friends", { cache: "no-store" });
    if (!res.ok) return null;
    const { friends } = (await res.json()) as { friends: FriendRow[] };
    return sharedCity(friends.find((f) => f.id === ownerId));
  } catch {
    return null;
  }
}

async function postSnack(id: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/visits/${encodeURIComponent(id)}/snack`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    if (res.ok) return null;
    const json = (await res.json().catch(() => null)) as {
      error?: { message?: unknown };
    } | null;
    const message = json?.error?.message;
    return typeof message === "string" && message ? message : UNREACHABLE;
  } catch {
    return UNREACHABLE;
  }
}

function useServerNow(offsetMs: number): number {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + offsetMs), TICK_MS);
    return () => clearInterval(timer);
  }, [offsetMs]);
  return now;
}

function VisitScreen({
  visit,
  live,
  timeZone,
  offsetMs,
  refresh,
}: {
  visit: SyncVisit;
  live: boolean;
  timeZone: string;
  offsetMs: number;
  refresh(): void;
}) {
  const toast = useToast();
  const nowMs = useServerNow(offsetMs);
  const [animate] = useState(() => !landedBefore(visit.id) && !reducedMotion());
  const [city, setCity] = useState<SenderCity | null>(null);
  const [snacking, setSnacking] = useState(false);
  const [snacked, setSnacked] = useState(false);
  const ownerId = visit.owner.id;

  useEffect(() => markLanded(visit.id), [visit.id]);

  useEffect(() => {
    let current = true;
    void senderCity(ownerId).then((c) => current && setCity(c));
    return () => {
      current = false;
    };
  }, [ownerId]);

  async function snack() {
    setSnacking(true);
    const failure = await postSnack(visit.id);
    setSnacking(false);
    if (failure) return toast(failure);
    setSnacked(true);
    refresh();
  }

  return (
    <Landed
      visit={snacked ? { ...visit, snackGiven: true } : visit}
      state={live ? landedState(visit, nowMs) : "gone"}
      city={city}
      nowMs={nowMs}
      timeZone={timeZone}
      animate={animate}
      snacking={snacking}
      onSnack={() => void snack()}
    />
  );
}

export default function VisitPage() {
  const { visitId } = useParams<{ visitId: string }>();
  const router = useRouter();
  const { data, offsetMs, refresh } = useSync();

  const live = data?.visits.find((v) => v.id === visitId) ?? null;
  const [last, setLast] = useState<SyncVisit | null>(null);
  if (live && live !== last) setLast(live);

  const visit = live ?? (last?.id === visitId ? last : null);
  const departed = data && !visit ? recall(visitId) : null;
  const unknown = data !== null && !visit && !departed;

  useEffect(() => {
    if (live) remember(live);
  }, [live]);

  useEffect(() => {
    if (unknown) router.replace("/sill");
  }, [unknown, router]);

  if (visit) {
    return (
      <VisitScreen
        key={visit.id}
        visit={visit}
        live={live !== null}
        timeZone={
          data?.me.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
        }
        offsetMs={offsetMs}
        refresh={refresh}
      />
    );
  }
  if (departed) return <GoneHome {...departed} />;
  return <Loader />;
}
