"use client";

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import {
  postmark,
  postmarkLabel,
  type SenderCity,
} from "@/app/(app)/sill/landedModel";
import { Postmark } from "@/app/(app)/sill/Postmark";
import { Bird, type GearId, type Look } from "@/components/Bird";
import { metHeadwind } from "@/components/FlightLog";
import { config } from "@/lib/config";
import { distance, duration, pronounTokens } from "@/lib/format";
import { NOT_A_PHONE, toE164, type E164 } from "@/lib/phone";
import type { GuestView as Guest } from "@/server/services/guestLinks/get";
import styles from "./GuestClaim.module.css";

const MINUTE = 60_000;
const BIRD_SIZE = 132;

export type LandedGuest = Guest & { note: NonNullable<Guest["note"]> };

export type ClaimCheck =
  | { ok: true; name: string; phone: E164 }
  | { ok: false; field: "name" | "phone"; error: string };

export function checkClaim(
  name: string,
  phone: string,
  bird: string,
): ClaimCheck {
  const trimmed = name.trim();
  if (!trimmed)
    return { ok: false, field: "name", error: `What should ${bird} call you?` };
  const e164 = toE164(phone);
  if (!e164) return { ok: false, field: "phone", error: NOT_A_PHONE };
  return { ok: true, name: trimmed, phone: e164 };
}

function senderCity(label: string): SenderCity {
  const cut = label.lastIndexOf(", ");
  return cut < 0
    ? { name: label, region: null }
    : { name: label.slice(0, cut), region: label.slice(cut + 2) };
}

export function claimCopy(guest: Guest, nowMs: number) {
  const p = pronounTokens(guest.bird.pronoun);
  const bird = guest.bird.name;
  const { flight } = guest;
  const trip =
    flight.plan && flight.arriveAt !== undefined
      ? `${distance(flight.plan.distanceMi, "mi")} in ${duration(flight.arriveAt - flight.releaseAt)}.`
      : `From ${flight.from.label} to ${flight.to.label}.`;
  const windy =
    flight.plan && flight.input && metHeadwind(flight.input, flight.plan)
      ? ` ${p.He} would like you to know about the headwind.`
      : "";
  const leavesAt =
    (flight.arriveAt ?? nowMs) + config.game.visits.waitMinutes * MINUTE;
  const left = Math.ceil((leavesAt - nowMs) / MINUTE);
  const waiting = left > 0;
  return {
    title: `${p.He} made it`,
    summary: `${trip}${windy}`,
    sill: `${bird} on your sill with the note`,
    offer: waiting
      ? `Send ${bird} home with a reply`
      : "Write back with a bird of your own",
    pitch: waiting
      ? `Make a free loft. You get a bird of your own, and ${bird} carries your answer back to ${guest.senderName}.`
      : `Make a free loft. You get a bird of your own to carry your answer to ${guest.senderName}.`,
    footer: waiting
      ? `${bird} waits on your sill for ${left} ${left === 1 ? "minute" : "minutes"}, then heads home.`
      : `${bird} has gone home.`,
  };
}

export function GuestClaim({
  guest,
  nowMs,
  timeZone,
}: {
  guest: LandedGuest;
  nowMs: number;
  timeZone: string;
}) {
  const copy = claimCopy(guest, nowMs);
  const city = senderCity(guest.flight.from.label);
  const stamp = postmark(guest.note.createdAt, city, timeZone);

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroWords}>
          <h1 className={styles.title}>{copy.title}</h1>
          <p className={styles.summary}>{copy.summary}</p>
        </div>
        <div className={styles.bird} role="img" aria-label={copy.sill}>
          <Bird
            look={guest.bird.look as Look}
            gear={guest.bird.gear as GearId[]}
            pose="landed"
            size={BIRD_SIZE}
          />
        </div>
      </section>
      <div className={styles.body}>
        <article className={styles.note}>
          <span className={styles.stamp}>
            <Postmark
              date={stamp.date}
              place={stamp.place}
              label={postmarkLabel(guest.note.createdAt, city, timeZone)}
            />
          </span>
          <div className={styles.noteFrom}>
            NOTE FROM {guest.senderName.toUpperCase()}
          </div>
          <p className={styles.noteBody}>{guest.note.body}</p>
        </article>
        <ClaimForm
          birdName={guest.bird.name}
          offer={copy.offer}
          pitch={copy.pitch}
        />
        <p className={styles.footer}>{copy.footer}</p>
      </div>
    </main>
  );
}

function ClaimForm({
  birdName,
  offer,
  pitch,
}: {
  birdName: string;
  offer: string;
  pitch: string;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [wrong, setWrong] = useState<Extract<ClaimCheck, { ok: false }> | null>(
    null,
  );
  const nameId = useId();
  const phoneId = useId();
  const errorId = useId();

  function submit(e: FormEvent) {
    e.preventDefault();
    const check = checkClaim(name, phone, birdName);
    if (!check.ok) return setWrong(check);
    setWrong(null);
    router.push("/sign-in");
  }

  const describe = (field: "name" | "phone") =>
    wrong?.field === field
      ? { "aria-invalid": true, "aria-describedby": errorId }
      : {};

  return (
    <form className={styles.claim} onSubmit={submit} noValidate>
      <div className={styles.claimHead}>
        <h2 className={styles.offer}>{offer}</h2>
        <p className={styles.pitch}>{pitch}</p>
      </div>
      <div className={styles.field}>
        <label htmlFor={nameId} className={styles.label}>
          Your name
        </label>
        <input
          id={nameId}
          className={`${styles.input} ${styles.hand}`}
          type="text"
          autoComplete="given-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          {...describe("name")}
        />
      </div>
      <div className={styles.field}>
        <label htmlFor={phoneId} className={styles.label}>
          Phone number, for landing texts
        </label>
        <input
          id={phoneId}
          className={styles.input}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="(555) 010-0199"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          {...describe("phone")}
        />
      </div>
      {wrong && (
        <p id={errorId} className={styles.error} role="alert">
          {wrong.error}
        </p>
      )}
      <button type="submit" className={styles.cta}>
        Make my loft
      </button>
    </form>
  );
}
