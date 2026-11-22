"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { useToast } from "@/components/Toasts";
import { asUnits } from "@/lib/format";
import { noteLimit } from "@/lib/game/notes";
import type { Wearer } from "@/lib/game/seeds";
import type { RecipientQuote } from "@/server/services/flights/quote";
import type { FriendRow } from "@/server/services/friends";
import { loadFriends } from "../../friends/friendsApi";
import { clearDraft, saveDraft } from "../forecast/draft";
import {
  type Assignment,
  assignBirds,
  counter,
  pickerOption,
  recipientLine,
  stats,
  swapBird,
} from "./compose";
import { quoteFor, release, type Send } from "./composeApi";
import { ComposeView, NoRecipient } from "./ComposeView";

type Friends =
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  | { kind: "ready"; friends: FriendRow[] };

type Swaps = { key: string; rows: Assignment };

const NOT_A_FRIEND = "That friend is not in your address book.";
const PLAIN_BIRD: Wearer = { breed: "city", gear: [] };

function Compose() {
  const friendIds = [...new Set(useSearchParams().getAll("to"))];
  const router = useRouter();
  const toast = useToast();
  const { data } = useSync();
  const [friends, setFriends] = useState<Friends>({ kind: "loading" });
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const [swaps, setSwaps] = useState<Swaps | null>(null);
  const [legs, setLegs] = useState<RecipientQuote[]>([]);

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

  const found =
    friends.kind === "ready"
      ? friendIds.map((id) => friends.friends.find((f) => f.id === id))
      : [];
  const recipients =
    found.length > 0 && found.every((f) => f !== undefined) ? found : [];
  const key = friendIds.join(",");
  const flock = data?.birds ?? [];
  const options = flock.map(pickerOption);
  const pickable = (id: string | null) =>
    options.some((o) => o.id === id && o.state.kind !== "blocked");
  const rows = (
    swaps?.key === key ? swaps.rows : assignBirds(recipients, flock)
  ).map((r) => ({ ...r, birdId: pickable(r.birdId) ? r.birdId : null }));
  const birdOf = (id: string | null) => flock.find((b) => b.id === id);
  const sends: Send[] = rows.flatMap(({ friendId, birdId }) =>
    birdId ? [{ friendId, birdId }] : [],
  );
  const quoteKey = JSON.stringify({
    friendIds: recipients.map((f) => f.id),
    birdIds: [...new Set(sends.map((s) => s.birdId))].sort(),
  });
  const draftKey = JSON.stringify(sends);

  useEffect(() => {
    const ask = JSON.parse(quoteKey) as {
      friendIds: string[];
      birdIds: string[];
    };
    if (ask.friendIds.length === 0 || ask.birdIds.length === 0) return;
    let live = true;
    void quoteFor(fetch, ask.friendIds, ask.birdIds).then((r) => {
      if (!live) return;
      if (r.ok) setLegs(r.quotes);
      else toast(r.message);
    });
    return () => {
      live = false;
      setLegs([]);
    };
  }, [quoteKey, toast]);

  useEffect(() => {
    for (const send of JSON.parse(draftKey) as Send[])
      saveDraft({ ...send, body: note });
  }, [draftKey, note]);

  if (!data || friends.kind === "loading") return <Loader />;
  if (friends.kind === "failed")
    return <NoRecipient message={friends.message} />;
  if (recipients.length === 0) return <NoRecipient message={NOT_A_FRIEND} />;

  const units = asUnits(data.me.units);
  const tightest: Wearer =
    sends
      .flatMap((s) => birdOf(s.birdId) ?? [])
      .sort((x, y) => noteLimit(x) - noteLimit(y))[0] ?? PLAIN_BIRD;

  const onRelease = async () => {
    if (sends.length !== rows.length) return;
    setSending(true);
    const r = await release(fetch, { body: note, sends });
    if (r.ok) {
      for (const send of sends) clearDraft(send.friendId);
      router.push(`/send/takeoff/${r.flightIds[0]}`);
      return;
    }
    setSending(false);
    toast(r.message);
  };

  return (
    <ComposeView
      rows={recipients.map((friend, i) => {
        const bird = birdOf(rows[i].birdId);
        const leg = legs.find(
          (l) =>
            "friendId" in l.recipient && l.recipient.friendId === friend.id,
        );
        return {
          friendId: friend.id,
          recipient: { name: friend.name, line: recipientLine(friend, units) },
          pickedId: bird?.id ?? null,
          tooLong: bird ? counter(note, bird).over : false,
          stats:
            bird && leg ? stats(leg, bird.id, data.me.timezone, units) : null,
          forecastHref: `/send/forecast?to=${encodeURIComponent(friend.id)}`,
        };
      })}
      note={note}
      counter={counter(note, tightest)}
      birds={options}
      sending={sending}
      onNote={setNote}
      onPick={(friendId, birdId) => {
        if (pickable(birdId))
          setSwaps({ key, rows: swapBird(rows, friendId, birdId) });
      }}
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
