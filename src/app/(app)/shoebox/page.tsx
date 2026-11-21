"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { useToast } from "@/components/Toasts";
import { asUnits } from "@/lib/format";
import type { FriendRow } from "@/server/services/friends";
import type { NotesPage } from "@/server/services/notes";
import { call, loadFriends } from "../friends/friendsApi";
import { ShoeboxView, type List } from "./ShoeboxView";

type FriendId = FriendRow["id"];

async function loadNotes(friendId: string | null, cursor: string | null) {
  const query = new URLSearchParams();
  if (friendId) query.set("friendId", friendId);
  if (cursor) query.set("cursor", cursor);
  const search = query.size ? `?${query}` : "";
  const r = await call(fetch, `/api/notes${search}`);
  return r.ok ? { ok: true as const, page: r.json as NotesPage } : r;
}

function Shoebox() {
  const router = useRouter();
  const selected = useSearchParams().get("friend") as FriendId | null;
  const { data } = useSync();
  const toast = useToast();
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [notes, setNotes] = useState<{ friendId: FriendId | null; list: List }>(
    { friendId: selected, list: { kind: "loading" } },
  );
  if (notes.friendId !== selected) {
    setNotes({ friendId: selected, list: { kind: "loading" } });
  }
  const { list } = notes;

  useEffect(() => {
    let live = true;
    void loadFriends().then((r) => {
      if (!live) return;
      if (r.ok) setFriends(r.friends);
      else toast(r.message);
    });
    return () => {
      live = false;
    };
  }, [toast]);

  useEffect(() => {
    let live = true;
    void loadNotes(selected, null).then((r) => {
      if (!live) return;
      if (!r.ok) toast(r.message);
      setNotes({
        friendId: selected,
        list: r.ok
          ? { kind: "ready", loadingMore: false, ...r.page }
          : { kind: "failed" },
      });
    });
    return () => {
      live = false;
    };
  }, [selected, toast]);

  const onSelect = (id: FriendId | null) => {
    router.replace(
      id ? `/shoebox?friend=${encodeURIComponent(id)}` : "/shoebox",
      { scroll: false },
    );
  };

  const onMore = () => {
    if (list.kind !== "ready" || !list.nextCursor || list.loadingMore) return;
    const { friendId } = notes;
    const cursor = list.nextCursor;
    setNotes({ friendId, list: { ...list, loadingMore: true } });
    void loadNotes(friendId, cursor).then((r) => {
      if (!r.ok) toast(r.message);
      setNotes((prev) => {
        const from = prev.list;
        if (
          prev.friendId !== friendId ||
          from.kind !== "ready" ||
          from.nextCursor !== cursor
        ) {
          return prev;
        }
        return {
          friendId,
          list: r.ok
            ? {
                kind: "ready",
                loadingMore: false,
                ...r.page,
                notes: [...from.notes, ...r.page.notes],
              }
            : { ...from, loadingMore: false },
        };
      });
    });
  };

  return (
    <ShoeboxView
      list={list}
      friends={friends}
      selected={selected}
      timeZone={
        data?.me.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
      }
      units={asUnits(data?.me.units)}
      onSelect={onSelect}
      onMore={onMore}
    />
  );
}

export default function ShoeboxPage() {
  return (
    <Suspense fallback={<Loader />}>
      <Shoebox />
    </Suspense>
  );
}
