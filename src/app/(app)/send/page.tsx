"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { useToast } from "@/components/Toasts";
import type { FriendRow } from "@/server/services/friends";
import { loadFriends } from "../friends/friendsApi";
import { fastestReady, friendCard, readyBirds } from "./recipients";
import { RecipientsView, type RecipientList } from "./RecipientsView";

type Friends =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "ready"; friends: FriendRow[] };

export default function SendPage() {
  const { data } = useSync();
  const [friends, setFriends] = useState<Friends>({ kind: "loading" });
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState("");
  const toast = useToast();

  useEffect(() => {
    let live = true;
    void loadFriends().then((r) => {
      if (!live) return;
      if (r.ok) {
        setFriends({ kind: "ready", friends: r.friends });
      } else {
        setFriends({ kind: "failed" });
        toast(r.message);
      }
    });
    return () => {
      live = false;
    };
  }, [toast]);

  const cards = useMemo(() => {
    if (friends.kind !== "ready" || !data) return [];
    const from = {
      loft: data.me.loft,
      bird: fastestReady(data.birds),
      nowMs: data.serverNow,
      units: data.me.units === "km" ? ("km" as const) : ("mi" as const),
    };
    return friends.friends.map((f) => friendCard(f, from));
  }, [friends, data]);

  if (!data) return <Loader />;

  const list: RecipientList =
    friends.kind === "ready" ? { kind: "ready", cards } : friends;

  const onToggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  return (
    <RecipientsView
      list={list}
      picked={picked}
      readyCount={readyBirds(data.birds).length}
      query={query}
      onQuery={setQuery}
      onToggle={onToggle}
    />
  );
}
