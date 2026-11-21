"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { useToast } from "@/components/Toasts";
import type { FriendRow, Shows } from "@/server/services/friends";
import {
  blockFriend,
  loadFriends,
  reportFriend,
  saveShows,
  unfriend,
  type ActionResult,
} from "./friendsApi";
import type { SheetState, SheetStep } from "./FriendSheet";
import { FriendsView, type ListState } from "./FriendsView";

const noSubscribe = () => () => {};

const ACTIONS: Record<
  Exclude<SheetStep, "menu">,
  {
    run: (friend: FriendRow, reason: string) => Promise<ActionResult>;
    done: (name: string) => string;
    drops: boolean;
  }
> = {
  unfriend: {
    run: (friend) => unfriend(friend.id),
    done: (name) => `You and ${name} are no longer friends.`,
    drops: true,
  },
  block: {
    run: (friend) => blockFriend(friend.id),
    done: (name) => `${name} is blocked.`,
    drops: true,
  },
  report: {
    run: (friend, reason) => reportFriend(friend.id, reason),
    done: () => "Thanks. Your report is in.",
    drops: false,
  },
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
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const toast = useToast();
  const saves = useRef(new Map<string, { next: Shows | null }>());

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

  const onCopy = () => {
    navigator.clipboard.writeText(inviteLink).then(
      () => toast("Link copied."),
      () => toast("Could not copy. Hold the link to copy it."),
    );
  };

  const onConfirm = (reason: string) => {
    if (!sheet || sheet.step === "menu" || sheet.busy) return;
    const { friend } = sheet;
    const action = ACTIONS[sheet.step];
    const forFriend = (next: (s: SheetState) => SheetState | null) =>
      setSheet((s) => (s?.friend.id === friend.id ? next(s) : s));
    setSheet({ ...sheet, busy: true });
    void action.run(friend, reason).then((r) => {
      if (!r.ok) {
        toast(r.message);
        forFriend((s) => ({ ...s, busy: false }));
        return;
      }
      forFriend(() => null);
      toast(action.done(friend.name));
      if (!action.drops) return;
      setList((l) =>
        l.kind === "ready"
          ? { ...l, friends: l.friends.filter((f) => f.id !== friend.id) }
          : l,
      );
    });
  };

  const onShows = (id: string, shows: Shows) => {
    const queued = saves.current.get(id);
    if (queued) {
      queued.next = shows;
      return;
    }
    if (
      list.kind !== "ready" ||
      list.friends.find((f) => f.id === id)?.shows === shows
    )
      return;
    const entry: { next: Shows | null } = { next: null };
    saves.current.set(id, entry);
    const send = (value: Shows) => {
      void saveShows(id, value).then((r) => {
        if (r.ok) {
          setList((l) =>
            l.kind === "ready"
              ? {
                  ...l,
                  friends: l.friends.map((f) =>
                    f.id === id ? { ...f, shows: r.shows } : f,
                  ),
                }
              : l,
          );
        } else {
          toast(r.message);
        }
        const { next } = entry;
        entry.next = null;
        if (next !== null && (!r.ok || next !== r.shows)) send(next);
        else saves.current.delete(id);
      });
    };
    send(shows);
  };

  return (
    <FriendsView
      inviteLink={inviteLink}
      units={data.me.units === "km" ? "km" : "mi"}
      list={list}
      onCopy={onCopy}
      sheet={sheet}
      onOpen={(friend) => setSheet({ friend, step: "menu", busy: false })}
      onStep={(step) => setSheet((s) => s && { ...s, step })}
      onClose={() => setSheet(null)}
      onConfirm={onConfirm}
      onShows={onShows}
    />
  );
}
