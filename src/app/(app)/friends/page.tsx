"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { useToast } from "@/components/Toasts";
import type { Shows } from "@/server/services/friends";
import { loadFriends, saveShows, withShows } from "./friendsApi";
import { FriendsView, type ListState } from "./FriendsView";

const noSubscribe = () => () => {};

type ShowsSaves = {
  confirmed: Shows;
  confirmedSeq: number;
  latestSeq: number;
  latestFailed: boolean;
};

function useOrigin(): string {
  return useSyncExternalStore(
    noSubscribe,
    () => window.location.origin,
    () => "",
  );
}

export default function FriendsPage() {
  const { data } = useSync();
  const origin = useOrigin();
  const [list, setList] = useState<ListState>({ kind: "loading" });
  const toast = useToast();
  const saves = useRef(new Map<string, ShowsSaves>());
  const seq = useRef(0);

  useEffect(() => {
    let live = true;
    void loadFriends().then((r) => {
      if (!live) return;
      if (r.ok) {
        setList({
          kind: "ready",
          friends: r.friends,
          guestLinks: r.guestLinks,
        });
      } else {
        setList({ kind: "failed" });
        toast(r.message);
      }
    });
    return () => {
      live = false;
    };
  }, [toast]);

  if (!data) return <Loader />;
  const inviteLink = `${origin}/join/${data.me.inviteCode}`;

  const onShows = (id: string, shows: Shows) => {
    if (list.kind !== "ready") return;
    const current = list.friends.find((f) => f.id === id)?.shows;
    if (!current) return;
    const n = ++seq.current;
    const before = saves.current.get(id) ?? {
      confirmed: current,
      confirmedSeq: 0,
    };
    saves.current.set(id, { ...before, latestSeq: n, latestFailed: false });
    setList({ ...list, friends: withShows(list.friends, id, shows) });
    void saveShows(id, shows).then((r) => {
      const now = saves.current.get(id)!;
      let next = now;
      if (r.ok && n > now.confirmedSeq) {
        next = { ...now, confirmed: shows, confirmedSeq: n };
      } else if (!r.ok && n === now.latestSeq) {
        next = { ...now, latestFailed: true };
        toast(r.message);
      }
      saves.current.set(id, next);
      if (!next.latestFailed) return;
      setList((l) =>
        l.kind === "ready"
          ? { ...l, friends: withShows(l.friends, id, next.confirmed) }
          : l,
      );
    });
  };

  const onCopy = () => {
    navigator.clipboard.writeText(inviteLink).then(
      () => toast("Link copied."),
      () => toast("Could not copy. Hold the link to copy it."),
    );
  };

  return (
    <FriendsView
      inviteLink={inviteLink}
      units={data.me.units === "km" ? "km" : "mi"}
      list={list}
      onCopy={onCopy}
      onShows={onShows}
    />
  );
}
