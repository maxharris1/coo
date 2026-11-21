"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { useToast } from "@/components/Toasts";
import type { Shows } from "@/server/services/friends";
import { loadFriends, saveShows, withShows } from "./friendsApi";
import { FriendsView, type ListState } from "./FriendsView";

const noSubscribe = () => () => {};

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
    const was = list.friends.find((f) => f.id === id)?.shows;
    if (!was) return;
    setList({ ...list, friends: withShows(list.friends, id, shows) });
    void saveShows(id, shows).then((r) => {
      if (r.ok) return;
      setList((now) =>
        now.kind === "ready"
          ? { ...now, friends: withShows(now.friends, id, was) }
          : now,
      );
      toast(r.message);
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
