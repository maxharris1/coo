"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { routePlaces } from "@/components/FlightLog";
import { MapView } from "@/components/MapView";
import { config } from "@/lib/config";
import { positionAt } from "@/lib/flight/engine";
import { clockTime, duration, pronounTokens } from "@/lib/format";
import type { GuestView as Guest } from "@/server/services/guestLinks/get";
import styles from "./Guest.module.css";
import { GuestNotify } from "./GuestNotify";
import { GuestReport } from "./GuestReport";

const TICK_MS = 10_000;
const MAP_BOTTOM_PX = 24;

type Progress = { frac: number; where: string; when: string };

function capital(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function guestCopy(guest: Guest, timeZone: string) {
  const p = pronounTokens(guest.bird.pronoun);
  const bird = guest.bird.name;
  const plural = guest.bird.pronoun === "they";
  const verb =
    guest.flight.status !== "scheduled" ? "left" : plural ? "leave" : "leaves";
  const at = clockTime(new Date(guest.flight.releaseAt), timeZone);
  return {
    title: `${guest.senderName} sent you a pigeon`,
    lede: `${capital(p.his)} name is ${bird}. ${p.He} ${verb} ${guest.flight.from.label} at ${at} with a note for you, ${guest.recipientName}.`,
    sealed: `It opens the moment ${bird} lands. ${p.He} ${plural ? "take" : "takes"} this seriously.`,
    notify: `Text me when ${p.he} lands`,
    consent: `Send me one text when ${bird} lands.`,
    map: `Live map. ${bird} is flying from ${guest.flight.from.label} to ${guest.flight.to.label}.`,
  };
}

function progress(guest: Guest, nowMs: number): Progress {
  const { flight } = guest;
  const left =
    flight.arriveAt === undefined
      ? undefined
      : `Lands in ${duration(flight.arriveAt - nowMs)}`;
  if (flight.status === "landed") {
    return { frac: 1, where: `Landed in ${flight.to.label}`, when: "" };
  }
  if (!flight.plan) {
    return {
      frac: 0,
      where: `Waiting in ${flight.from.label}`,
      when: left ?? "",
    };
  }
  const at = positionAt(flight.plan, flight.from, flight.to, nowMs);
  const { deciles } = routePlaces(flight.placeNames);
  const place = deciles.length
    ? deciles[Math.round(at.frac * (deciles.length - 1))]
    : null;
  const where =
    at.state === "waiting"
      ? `Waiting in ${flight.from.label}`
      : at.state === "roosting"
        ? place
          ? `Asleep near ${place}`
          : "Roosting for the night"
        : place
          ? `Over ${place}`
          : `On the way to ${flight.to.label}`;
  return { frac: at.frac, where, when: left ?? "" };
}

export function GuestView({
  guest,
  token,
  serverNow,
  timeZone,
}: {
  guest: Guest;
  token: string;
  serverNow: number;
  timeZone: string;
}) {
  const [clock, setClock] = useState({ nowMs: serverNow, offsetMs: 0 });

  useEffect(() => {
    const offsetMs = serverNow - Date.now();
    const tick = () => setClock({ nowMs: Date.now() + offsetMs, offsetMs });
    tick();
    const timer = setInterval(tick, TICK_MS);
    return () => clearInterval(timer);
  }, [serverNow]);

  const copy = guestCopy(guest, timeZone);
  const now = progress(guest, clock.nowMs);
  const percent = Math.round(now.frac * 100);
  const { flight } = guest;

  return (
    <main className={styles.page}>
      <header className={styles.top}>
        <p className={styles.logo}>{config.app.name.toLowerCase()}</p>
        <span className={styles.chip}>No app needed</span>
      </header>
      <div className={styles.head}>
        <h1 className={styles.title}>{copy.title}</h1>
        <p className={styles.lede}>{copy.lede}</p>
      </div>
      <div className={styles.map} role="img" aria-label={copy.map}>
        {flight.plan && (
          <MapView
            flightId="guest"
            from={flight.from}
            to={flight.to}
            plan={flight.plan}
            distanceMi={flight.plan.distanceMi}
            bird={{ id: "guest", ...guest.bird }}
            offsetMs={clock.offsetMs}
            bottomPadding={MAP_BOTTOM_PX}
            night={false}
            loftLabel={`${guest.senderName}, ${flight.from.label}`}
            sillLabel={`You, ${flight.to.label}`}
          />
        )}
      </div>
      <div className={styles.progress}>
        <div
          className={styles.track}
          role="progressbar"
          aria-label="Distance flown"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div className={styles.fill} style={{ width: `${percent}%` }} />
        </div>
        <p className={styles.ends}>
          <span>{now.where}</span>
          <span>{now.when}</span>
        </p>
      </div>
      {guest.note ? (
        <section className={styles.note} aria-label="Your note">
          <p className={styles.noteBody}>{guest.note.body}</p>
        </section>
      ) : (
        <section className={styles.sealed}>
          <svg
            className={styles.envelope}
            viewBox="0 0 120 84"
            aria-hidden="true"
          >
            <rect x="6" y="10" width="108" height="66" rx="5" />
            <path d="M6 14 L60 50 L114 14" fill="none" />
            <circle className={styles.seal} cx="60" cy="50" r="13" />
          </svg>
          <div className={styles.sealedWords}>
            <h2 className={styles.sealedTitle}>Your note is sealed</h2>
            <p className={styles.sealedBody}>{copy.sealed}</p>
          </div>
        </section>
      )}
      <div className={styles.actions}>
        {flight.status !== "landed" && (
          <GuestNotify
            token={token}
            button={copy.notify}
            consent={copy.consent}
            birdName={guest.bird.name}
          />
        )}
        <Link href="/welcome" className={styles.link}>
          What is this?
        </Link>
        <GuestReport token={token} />
      </div>
    </main>
  );
}
