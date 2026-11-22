"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { useToast } from "@/components/Toasts";
import { asUnits } from "@/lib/format";
import type { Wearer } from "@/lib/game/seeds";
import type { RecipientQuote } from "@/server/services/flights/quote";
import type { FriendRow } from "@/server/services/friends";
import { loadFriends } from "../../friends/friendsApi";
import { clearDraft, saveDraft } from "../forecast/draft";
import {
  counter,
  pickerOption,
  recipientLine,
  releaseBird,
  stats,
} from "./compose";
import { quoteFor, release } from "./composeApi";
import { ComposeView, NoRecipient } from "./ComposeView";

type Friends =
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  | { kind: "ready"; friends: FriendRow[] };

type Quote = { friendId: string; birdId: string; leg: RecipientQuote } | null;

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
  const [picked, setPicked] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote>(null);

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

  const friend =
    friends.kind === "ready"
      ? friends.friends.find((f) => f.id === friendId)
      : undefined;
  const flock = data?.birds ?? [];
  const options = flock.map(pickerOption);
  const pickable = (id: string | null) =>
    options.some((o) => o.id === id && o.state.kind !== "blocked");
  const bird =
    (pickable(picked) ? flock.find((b) => b.id === picked) : undefined) ??
    releaseBird(flock);
  const quoteFriend = friend?.id;
  const quoteBird = bird?.id;

  useEffect(() => {
    if (!quoteFriend || !quoteBird) return;
    let live = true;
    void quoteFor(fetch, quoteFriend, [quoteBird]).then((r) => {
      if (!live) return;
      if (r.ok)
        setQuote({ friendId: quoteFriend, birdId: quoteBird, leg: r.quote });
      else toast(r.message);
    });
    return () => {
      live = false;
      setQuote(null);
    };
  }, [quoteFriend, quoteBird, toast]);

  useEffect(() => {
    if (quoteFriend && quoteBird)
      saveDraft({ friendId: quoteFriend, birdId: quoteBird, body: note });
  }, [quoteFriend, quoteBird, note]);

  if (!data || friends.kind === "loading") return <Loader />;
  if (friends.kind === "failed")
    return <NoRecipient message={friends.message} />;
  if (!friend) return <NoRecipient message={NOT_A_FRIEND} />;

  const units = asUnits(data.me.units);

  const onRelease = async () => {
    if (!bird) return;
    setSending(true);
    const r = await release(fetch, {
      body: note,
      friendId: friend.id,
      birdId: bird.id,
    });
    if (r.ok) {
      clearDraft(friend.id);
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
      birds={options}
      pickedId={bird?.id ?? null}
      stats={
        bird && quote?.friendId === friend.id && quote.birdId === bird.id
          ? stats(quote.leg, bird.id, data.me.timezone, units)
          : null
      }
      forecastHref={`/send/forecast?to=${encodeURIComponent(friend.id)}`}
      sending={sending}
      onNote={setNote}
      onPick={(id) => {
        if (pickable(id)) setPicked(id);
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
