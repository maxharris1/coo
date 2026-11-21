"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { useToast } from "@/components/Toasts";
import type { Wearer } from "@/lib/game/seeds";
import type { FriendRow } from "@/server/services/friends";
import { loadFriends } from "../../friends/friendsApi";
import { counter, recipientLine, releaseBird } from "./compose";
import { release } from "./composeApi";
import { ComposeView, NoRecipient } from "./ComposeView";

type Friends =
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  | { kind: "ready"; friends: FriendRow[] };

const NOT_A_FRIEND = "That friend is not in your address book.";
const PLAIN_BIRD: Wearer = { breed: "city", gear: [] };

function Compose() {
  const friendId = useSearchParams().get("to");
  const router = useRouter();
  const toast = useToast();
  const { data } = useSync();
  const [friends, setFriends] = useState<Friends>({ kind: "loading" });
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let live = true;
    void loadFriends().then((r) => {
      if (!live) return;
      setFriends(
        r.ok
          ? { kind: "ready", friends: r.friends }
          : { kind: "failed", message: r.message },
      );
    });
    return () => {
      live = false;
    };
  }, []);

  if (!data || friends.kind === "loading") return <Loader />;
  if (friends.kind === "failed")
    return <NoRecipient message={friends.message} />;
  const friend = friends.friends.find((f) => f.id === friendId);
  if (!friend) return <NoRecipient message={NOT_A_FRIEND} />;

  const bird = releaseBird(data.birds);
  const units = data.me.units === "km" ? "km" : "mi";

  const onRelease = async () => {
    if (!bird) return;
    setSending(true);
    const r = await release(fetch, {
      body: note,
      friendId: friend.id,
      birdId: bird.id,
    });
    if (r.ok) {
      router.push(`/send/takeoff/${r.flightId}`);
      return;
    }
    setSending(false);
    toast(r.message);
  };

  return (
    <ComposeView
      recipient={{ name: friend.name, line: recipientLine(friend, units) }}
      note={note}
      counter={counter(note, bird ?? PLAIN_BIRD)}
      birdName={bird?.name ?? null}
      sending={sending}
      onNote={setNote}
      onRelease={() => void onRelease()}
    />
  );
}

export default function ComposePage() {
  return (
    <Suspense fallback={<Loader />}>
      <Compose />
    </Suspense>
  );
}
