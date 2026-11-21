import { Bird, type Look } from "@/components/Bird";
import { distance, duration } from "@/lib/format";
import type { ShoeboxNote } from "@/server/services/notes";
import { postmark, postmarkLabel } from "../sill/landedModel";
import { Postmark } from "../sill/Postmark";
import styles from "./NoteCard.module.css";

const TILTS = [0.8, -0.9, 0.5, -0.6];
const MINUTE_MS = 60_000;
const SMALL_MI = 0.5;
const AVATAR_BIRD = 63;

const HEADS: Record<ShoeboxNote["direction"], string> = {
  received: "FROM",
  sent: "TO",
};

const STATES: Record<ShoeboxNote["state"], string | null> = {
  delivered: null,
  in_the_air: "In the air",
  returned: "Came back home",
};

function tripDistance(miles: number): string {
  return miles < SMALL_MI ? distance(miles, "mi") : `${Math.round(miles)} mi`;
}

function tripDuration(ms: number): string {
  if (ms >= MINUTE_MS) return duration(ms);
  const s = Math.round(ms / 1000);
  return `${s} ${s === 1 ? "second" : "seconds"}`;
}

function tripLine({ bird, trip }: ShoeboxNote): string | null {
  if (!bird) return null;
  if (trip?.distanceMi == null || trip.durationMs == null) return bird.name;
  return `${bird.name}, ${tripDistance(trip.distanceMi)} in ${tripDuration(trip.durationMs)}`;
}

type NoteCardProps = { note: ShoeboxNote; index: number; timeZone: string };

export function NoteCard({ note, index, timeZone }: NoteCardProps) {
  const stamp = postmark(note.createdAt, null, timeZone);
  const state = STATES[note.state];
  return (
    <article
      className={styles.card}
      style={{ transform: `rotate(${TILTS[index % TILTS.length]}deg)` }}
    >
      <span className={styles.stamp}>
        <Postmark
          date={stamp.date}
          place={stamp.place}
          label={postmarkLabel(note.createdAt, null, timeZone)}
        />
      </span>
      <div className={styles.head}>
        {HEADS[note.direction]} {note.with.name.toUpperCase()}
      </div>
      <p className={styles.body}>{note.body}</p>
      {note.bird && (
        <div className={styles.trip}>
          <span className={styles.avatar} aria-hidden="true">
            <span className={styles.avatarBird}>
              <Bird
                look={note.bird.look as Look}
                animated={false}
                size={AVATAR_BIRD}
              />
            </span>
          </span>
          <span>{state ? note.bird.name : tripLine(note)}</span>
          {state && <span className={styles.state}>{state}</span>}
        </div>
      )}
      {!note.bird && state && <span className={styles.state}>{state}</span>}
    </article>
  );
}
