"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { GearId, Look } from "@/components/Bird";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { useToast } from "@/components/Toasts";
import type { Units } from "@/lib/format";
import type { FriendRow } from "@/server/services/friends";
import type { SyncVisit } from "@/server/services/visits/syncRead";
import { friendRow, postReply } from "./replyApi";
import { counter, replyModel } from "./replyModel";
import { ReplyView } from "./ReplyView";
import { saveHandoff } from "./takeoffHandoff";

const TICK_MS = 1000;

function useServerNow(offsetMs: number): number {
  const [now, setNow] = useState(() => Date.now() + offsetMs);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + offsetMs), TICK_MS);
    return () => clearInterval(timer);
  }, [offsetMs]);
  return now;
}

function ReplyScreen({
  visit,
  units,
  nowMs,
  onSent,
}: {
  visit: SyncVisit;
  units: Units;
  nowMs: number;
  onSent(): void;
}) {
  const toast = useToast();
  const [friend, setFriend] = useState<FriendRow | undefined>();
  const [note, setNote] = useState("");
  const [sending, setSending] = useState(false);
  const ownerId = visit.owner.id;

  useEffect(() => {
    let current = true;
    void friendRow(fetch, ownerId).then((f) => current && setFriend(f));
    return () => {
      current = false;
    };
  }, [ownerId]);

  const model = replyModel(visit, friend, nowMs, units);
  const count = counter(note, model.limit);

  async function send() {
    if (sending || note.trim() === "" || count.over) return;
    setSending(true);
    const result = await postReply(fetch, visit.id, note);
    if (!result.ok) {
      setSending(false);
      return toast(result.message);
    }
    saveHandoff(visit.id, {
      flightId: result.flight.id,
      pronoun: visit.bird.pronoun,
    });
    onSent();
  }

  return (
    <ReplyView
      backHref={`/sill/${visit.id}`}
      model={model}
      bird={{
        look: visit.bird.look as Look,
        breed: visit.bird.breed,
        gear: visit.bird.gear as GearId[],
      }}
      note={note}
      counter={count}
      sending={sending}
      onNote={setNote}
      onSend={() => void send()}
    />
  );
}

export default function ReplyPage() {
  const { visitId } = useParams<{ visitId: string }>();
  const router = useRouter();
  const { data, offsetMs } = useSync();
  const nowMs = useServerNow(offsetMs);
  const [sent, setSent] = useState(false);

  const visit = data?.visits.find((v) => v.id === visitId) ?? null;
  const over = data !== null && (!visit || nowMs >= visit.leavesAt);

  useEffect(() => {
    if (over && !sent) router.replace(`/sill/${visitId}`);
  }, [over, sent, visitId, router]);

  if (!visit || over || sent) return <Loader />;
  return (
    <ReplyScreen
      key={visit.id}
      visit={visit}
      units={data?.me.units === "km" ? "km" : "mi"}
      nowMs={nowMs}
      onSent={() => {
        setSent(true);
        router.replace(`/sill/${visitId}/takeoff`);
      }}
    />
  );
}
