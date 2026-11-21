"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { useToast } from "@/components/Toasts";
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
  const [list, setList] = useState<List>({ kind: "loading" });
  const latest = useRef(0);

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
    latest.current++;
    void loadNotes(selected, null).then((r) => {
      if (!live) return;
      if (r.ok) {
        setList({ kind: "ready", loadingMore: false, ...r.page });
      } else {
        setList({ kind: "failed" });
        toast(r.message);
      }
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
    const token = ++latest.current;
    setList({ ...list, loadingMore: true });
    void loadNotes(selected, list.nextCursor).then((r) => {
      if (token !== latest.current) return;
      if (!r.ok) toast(r.message);
      setList((prev) => {
        if (prev.kind !== "ready") return prev;
        if (!r.ok) return { ...prev, loadingMore: false };
        return {
          kind: "ready",
          loadingMore: false,
          ...r.page,
          notes: [...prev.notes, ...r.page.notes],
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
