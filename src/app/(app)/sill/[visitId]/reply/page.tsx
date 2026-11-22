"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Look } from "@/components/Bird";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { useToast } from "@/components/Toasts";
import { asUnits, type Units } from "@/lib/format";
import type { Doodle } from "@/lib/game/notes";
import type { FriendRow } from "@/server/services/friends";
import type { SyncVisit } from "@/server/services/visits/syncRead";
import { friendRow, postReply } from "./replyApi";
import { canSend, counter, replyModel } from "./replyModel";
import { ReplyView } from "./ReplyView";
import { saveHandoff } from "./takeoffHandoff";
import { useServerNow } from "../../useServerNow";

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
  const [doodle, setDoodle] = useState<Doodle | null>(null);
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
    if (sending || !canSend(note, doodle, count)) return;
    setSending(true);
    const result = await postReply(fetch, visit.id, note, doodle);
    if (!result.ok) {
      setSending(false);
      return toast(result.message);
    }
    saveHandoff(visit.id, {
      flightId: result.flight.id,
      pronoun: visit.bird.pronoun,
      breed: visit.bird.breed,
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
        gear: visit.bird.gear,
      }}
      note={note}
      doodle={doodle}
      counter={count}
      sending={sending}
      onNote={setNote}
      onDoodle={setDoodle}
      onSend={() => void send()}
    />
  );
}

export default function ReplyPage() {
  const { visitId } = useParams<{ visitId: string }>();
  const router = useRouter();
  const { data, refresh } = useSync();
  const nowMs = useServerNow(data);
  const [sent, setSent] = useState(false);

  const visit = data?.visits.find((v) => v.id === visitId) ?? null;
  const over = data !== null && (!visit || data.serverNow >= visit.leavesAt);
  const looksOver = visit !== null && nowMs !== null && nowMs >= visit.leavesAt;

  useEffect(() => {
    if (over && !sent) router.replace(`/sill/${visitId}`);
  }, [over, sent, visitId, router]);

  useEffect(() => {
    if (looksOver && !over) refresh();
  }, [looksOver, over, refresh]);

  if (!visit || nowMs === null || over || sent) return <Loader />;
  return (
    <ReplyScreen
      key={visit.id}
      visit={visit}
      units={asUnits(data?.me.units)}
      nowMs={nowMs}
      onSent={() => {
        setSent(true);
        router.replace(`/sill/${visitId}/takeoff`);
      }}
    />
  );
}
