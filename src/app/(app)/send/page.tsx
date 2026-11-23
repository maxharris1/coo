"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { useToast } from "@/components/Toasts";
import { asUnits } from "@/lib/format";
import type { FriendRow } from "@/server/services/friends";
import { loadFriends } from "../friends/friendsApi";
import {
  canPickContacts,
  fastestReady,
  friendCard,
  handOffName,
  pickContacts,
  readyBirds,
  sillCard,
} from "./recipients";
import { RecipientsView, type RecipientList } from "./RecipientsView";

type Friends =
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "ready"; friends: FriendRow[] };

const noSubscribe = () => () => {};

export default function SendPage() {
  const { data } = useSync();
  const [friends, setFriends] = useState<Friends>({ kind: "loading" });
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set());
  const [query, setQuery] = useState("");
  const [contactNames, setContactNames] = useState<string[]>([]);
  const canPick = useSyncExternalStore(
    noSubscribe,
    () => canPickContacts(navigator),
    () => false,
  );
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
      timezone: data.me.timezone,
      units: asUnits(data.me.units),
    };
    return friends.friends.map((f) => friendCard(f, from));
  }, [friends, data]);

  const sill = useMemo(() => (data ? data.visits.map(sillCard) : []), [data]);

  if (!data) return <Loader />;

  const list: RecipientList =
    friends.kind === "ready" ? { kind: "ready", cards } : friends;

  const onToggle = (id: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const onPickContacts = () => {
    void pickContacts(navigator).then((names) => {
      if (names.length > 0) setContactNames(names);
    });
  };

  const onOpenContact = (name: string) => handOffName(sessionStorage, name);

  return (
    <RecipientsView
      list={list}
      sill={sill}
      contacts={{ supported: canPick, names: contactNames }}
      picked={picked}
      readyCount={readyBirds(data.birds).length}
      query={query}
      onQuery={setQuery}
      onToggle={onToggle}
      onPickContacts={onPickContacts}
      onOpenContact={onOpenContact}
    />
  );
}
