"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { useToast } from "@/components/Toasts";
import { asUnits, type Units } from "@/lib/format";
import { type Doodle, noteLimit } from "@/lib/game/notes";
import type { Wearer } from "@/lib/game/seeds";
import type {
  QuoteRecipient,
  RecipientQuote,
} from "@/server/services/flights/quote";
import type { FriendRow } from "@/server/services/friends";
import { postCare } from "../../feed";
import { feedThenRefresh } from "../../flockRows";
import { loadFriends } from "../../friends/friendsApi";
import { clearDraft, readDraft, saveDraft } from "../forecast/draft";
import { holdLink } from "../share/[flightId]/linkHandoff";
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
import { ComposeView, NoRecipient, type Recipient } from "./ComposeView";
import { type Guest, readGuest } from "./guest";

type Friends =
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  | { kind: "ready"; friends: FriendRow[] };

type Swaps = { key: string; rows: Assignment };

type Target = {
  id: string;
  distanceMi: number | null;
  ask: QuoteRecipient;
  owns: (leg: RecipientQuote) => boolean;
  send: (birdId: string) => Send;
  card: (leg: RecipientQuote | undefined, units: Units) => Recipient;
  forecastHref: string | null;
};

const NOT_A_FRIEND = "That friend is not in your address book.";
const PLAIN_BIRD: Wearer = { breed: "city", gear: [] };
const sessionPins = { getItem: (key: string) => sessionStorage.getItem(key) };

const friendTarget = (friend: FriendRow): Target => ({
  id: friend.id,
  distanceMi: friend.distanceMi,
  ask: { friendId: friend.id },
  owns: (l) => "friendId" in l.recipient && l.recipient.friendId === friend.id,
  send: (birdId) => ({ friendId: friend.id, birdId }),
  card: (_, units) => ({
    name: friend.name,
    line: recipientLine(friend, units),
  }),
  forecastHref: `/send/forecast?to=${encodeURIComponent(friend.id)}`,
});

function guestTarget(guest: Guest): Target {
  const { name, ...place } = guest;
  return {
    id: place.placeId,
    distanceMi: null,
    ask: { place },
    owns: (l) => "place" in l.recipient,
    send: (birdId) => ({ guest, birdId }),
    card: (leg) => ({ name, line: leg?.to.label ?? "" }),
    forecastHref: null,
  };
}

function Compose() {
  const params = useSearchParams();
  const friendIds = [...new Set(params.getAll("to"))];
  const guest = friendIds.length === 0 ? readGuest(params, sessionPins) : null;
  const forGuest = guest !== null;
  const router = useRouter();
  const toast = useToast();
  const { data, refresh } = useSync();
  const [friends, setFriends] = useState<Friends>({ kind: "loading" });
  const [saved] = useState(() =>
    friendIds.flatMap((id) => readDraft(id) ?? []),
  );
  const [note, setNote] = useState(saved[0]?.body ?? "");
  const [doodle, setDoodle] = useState<Doodle | null>(null);
  const [sending, setSending] = useState(false);
  const [swaps, setSwaps] = useState<Swaps | null>(null);
  const [shots, setShots] = useState<Record<string, string>>({});
  const [legs, setLegs] = useState<RecipientQuote[]>([]);

  useEffect(() => {
    if (forGuest) return;
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
  }, [forGuest]);

  const found =
    friends.kind === "ready"
      ? friendIds.map((id) => friends.friends.find((f) => f.id === id))
      : [];
  const recipients =
    found.length > 0 && found.every((f) => f !== undefined) ? found : [];
  const targets = guest ? [guestTarget(guest)] : recipients.map(friendTarget);
  const key = guest ? JSON.stringify(guest) : friendIds.join(",");
  const flock = data?.birds ?? [];
  const options = flock.map(pickerOption);
  const pickable = (id: string | null) =>
    options.some((o) => o.id === id && o.state.kind !== "blocked");
  const rows = (
    swaps?.key === key
      ? swaps.rows
      : saved
          .filter((d) => pickable(d.birdId))
          .reduce(
            (rs, d) => swapBird(rs, d.friendId, d.birdId),
            assignBirds(targets, flock),
          )
  ).map((r) => ({ ...r, birdId: pickable(r.birdId) ? r.birdId : null }));
  const kept = Object.fromEntries(
    Object.entries(shots).filter(
      ([id, birdId]) => rows.find((r) => r.id === id)?.birdId === birdId,
    ),
  );
  if (Object.keys(kept).length !== Object.keys(shots).length) setShots(kept);
  const birdOf = (id: string | null) => flock.find((b) => b.id === id);
  const sends: Send[] = rows.flatMap(({ birdId }, i) =>
    birdId ? [targets[i].send(birdId)] : [],
  );
  const quoteKey = JSON.stringify({
    recipients: targets.map((t) => t.ask),
    birdIds: [...new Set(sends.map((s) => s.birdId))].sort(),
  });
  const draftKey = JSON.stringify(sends);

  useEffect(() => {
    const ask = JSON.parse(quoteKey) as {
      recipients: QuoteRecipient[];
      birdIds: string[];
    };
    if (ask.recipients.length === 0 || ask.birdIds.length === 0) return;
    let live = true;
    void quoteFor(fetch, ask.recipients, ask.birdIds).then((r) => {
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
      if ("friendId" in send) saveDraft({ ...send, body: note });
  }, [draftKey, note]);

  if (!data || (!forGuest && friends.kind === "loading")) return <Loader />;
  if (!forGuest && friends.kind === "failed")
    return <NoRecipient message={friends.message} />;
  if (targets.length === 0) return <NoRecipient message={NOT_A_FRIEND} />;

  const units = asUnits(data.me.units);
  const tightest: Wearer =
    sends
      .flatMap((s) => birdOf(s.birdId) ?? [])
      .sort((x, y) => noteLimit(x) - noteLimit(y))[0] ?? PLAIN_BIRD;
  const lines = targets.map((target, i) => {
    const bird = birdOf(rows[i].birdId);
    const leg = legs.find(target.owns);
    const offered = leg?.quotes.find((q) => q.birdId === bird?.id)?.espresso
      ? bird
      : undefined;
    const shot = offered !== undefined && shots[target.id] === offered.id;
    return { target, bird, leg, offered, shot };
  });
  const spent = lines.filter((l) => l.shot).length;

  const onRelease = async () => {
    if (sends.length !== rows.length) return;
    setSending(true);
    const r = await release(fetch, {
      body: note,
      doodle,
      sends: sends.map((s, i) =>
        lines[i].shot ? { ...s, espresso: true } : s,
      ),
    });
    if (r.ok) {
      for (const send of sends)
        if ("friendId" in send) clearDraft(send.friendId);
      for (const { flightId, url } of r.links) holdLink(flightId, url);
      router.push(`/send/takeoff/${r.flightIds[0]}`);
      return;
    }
    setSending(false);
    toast(r.message);
  };

  return (
    <ComposeView
      rows={lines.map(({ target, bird, leg, offered, shot }) => ({
        id: target.id,
        recipient: target.card(leg, units),
        pickedId: bird?.id ?? null,
        tooLong: bird ? counter(note, bird).over : false,
        stats:
          bird && leg
            ? stats(leg, bird.id, data.me.timezone, units, shot)
            : null,
        forecastHref: target.forecastHref,
        espresso: offered
          ? {
              label: `Espresso shot · keep ${offered.name} up tonight`,
              ticked: shot,
              disabled: !shot && spent >= data.me.espressoShots,
            }
          : null,
      }))}
      note={note}
      doodle={doodle}
      counter={counter(note, tightest)}
      birds={options}
      sending={sending}
      onNote={setNote}
      onDoodle={setDoodle}
      onPick={(rowId, birdId) => {
        if (!pickable(birdId)) return;
        setSwaps({ key, rows: swapBird(rows, rowId, birdId) });
      }}
      onRelease={() => void onRelease()}
      onEspresso={(rowId, on) => {
        const birdId = rows.find((r) => r.id === rowId)?.birdId;
        setShots(
          Object.fromEntries([
            ...Object.entries(shots).filter(([id]) => id !== rowId),
            ...(on && birdId ? [[rowId, birdId]] : []),
          ]),
        );
      }}
      onWake={(birdId) =>
        void feedThenRefresh(
          birdId,
          (id) => postCare(id, "wake"),
          refresh,
          toast,
        )
      }
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
