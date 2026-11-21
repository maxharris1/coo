"use client";

import { useEffect, useState } from "react";
import {
  type FlightPlan,
  hash32,
  isDaylight,
  positionAt,
} from "@/lib/flight/engine";
import { clockTime, duration, inUnits, type Units } from "@/lib/format";
import Link from "next/link";
import type { Flight } from "@/server/services/flights/shape";
import { Bird, type GearId, type Look } from "./Bird";
import { MapView } from "./MapView";
import styles from "./Tracker.module.css";
import { TrackerDelay } from "./TrackerDelay";
import { TrackerEarn } from "./TrackerEarn";

type TrackerState = "scheduled" | "flying" | "roosting" | "delayed" | "landed";
type Stat = { value: string; label: string };
export type TrackerView = {
  state: TrackerState;
  chip: string;
  headline: string;
  sub: string;
  fromLabel: string;
  toLabel: string;
  progress: { frac: number; text: string };
  stats: [Stat, Stat, Stat];
  night: boolean;
  tickMs: number;
  toName: string;
  loftLabel: string;
  sillLabel: string;
};

type Copy = { bird: string; place: string; from: string; to: string };

const STATES: Record<
  TrackerState,
  { chip: string; headline: (c: Copy) => string }
> = {
  scheduled: {
    chip: "Scheduled",
    headline: (c) => `${c.bird} is waiting at ${c.from}`,
  },
  flying: {
    chip: "In the air",
    headline: (c) => `${c.bird} is over ${c.place}`,
  },
  roosting: { chip: "Roosting", headline: (c) => `Asleep near ${c.place}` },
  delayed: { chip: "Delayed", headline: (c) => `Last seen near ${c.place}` },
  landed: { chip: "Landed", headline: (c) => `${c.bird} landed at ${c.to}` },
};

const ALTITUDES = ["Rooftop", "Lowish", "Quite high"];
const ROOSTS = ["A barn", "A water tower", "A ledge"];
const COUNTS = ["one", "two", "three", "four", "five", "six", "seven"];
const SHORT_FLIGHT_MS = 10 * 60_000;
const CARD_PX = 260;

function position(
  flight: Flight,
  nowMs: number,
): { state: TrackerState; frac: number; night: boolean } {
  if (flight.status === "landed") {
    return { state: "landed", frac: 1, night: !isDaylight(nowMs, flight.to) };
  }
  if (!flight.plan) {
    return {
      state: "scheduled",
      frac: 0,
      night: !isDaylight(nowMs, flight.from),
    };
  }
  const p = positionAt(flight.plan, flight.from, flight.to, nowMs);
  return {
    state: p.state === "waiting" ? "scheduled" : p.state,
    frac: p.frac,
    night: !isDaylight(nowMs, p),
  };
}

function roostAt(plan: FlightPlan | undefined, nowMs: number) {
  const roosts = (plan?.segments ?? []).filter((s) => s.kind === "roost");
  const index = roosts.findIndex((s) => s.startMs <= nowMs && nowMs < s.endMs);
  return index < 0
    ? undefined
    : { index, count: roosts.length, segment: roosts[index] };
}

const roughDay = new Map<string, Intl.DateTimeFormat>();

function roughly(at: number, timeZone: string): string {
  let f = roughDay.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "short",
      hour: "numeric",
      hour12: true,
    });
    roughDay.set(timeZone, f);
  }
  const p: Record<string, string> = {};
  for (const { type, value } of f.formatToParts(at)) p[type] = value;
  return `${p.weekday} ${p.hour} ${p.dayPeriod.toLowerCase()}`;
}

function totalMi(flight: Flight): number {
  return flight.distanceMi ?? flight.plan?.distanceMi ?? 0;
}

function placeAt(flight: Flight, nowMs: number): string {
  const events = flight.plan?.events ?? [];
  for (let i = events.length - 1; i >= 0; i--) {
    const name = flight.placeNames.events?.[String(i)];
    if (events[i].atMs <= nowMs && name) return name;
  }
  return flight.from.label;
}

function rounded(n: number, total: number): string {
  const digits = total < 1 ? 2 : total < 10 ? 1 : 0;
  return String(Number(n.toFixed(digits)));
}

function seconds(ms: number): string {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  if (!m) return `${s} sec`;
  return s % 60 ? `${m} min ${s % 60} sec` : `${m} min`;
}

function recipient(flight: Flight): string | undefined {
  return flight.counterpart?.name ?? flight.guestName;
}

function pins(flight: Flight) {
  if (flight.role === "incoming") {
    return {
      toName: "You",
      loftLabel: `${flight.owner.name}, ${flight.from.label}`,
      sillLabel: "Your sill",
    };
  }
  const to = recipient(flight);
  return {
    toName: to ?? flight.to.label,
    loftLabel: "Your loft",
    sillLabel: to ? `${to}, ${flight.to.label}` : flight.to.label,
  };
}

function subLine(flight: Flight, roost: ReturnType<typeof roostAt>): string {
  if (flight.role === "incoming") return "Carrying a note for you";
  if (roost && roost.count < COUNTS.length) {
    const to = recipient(flight) ?? flight.to.label;
    return `Night ${COUNTS[roost.index]} of a ${COUNTS[roost.count]}-day flight to ${to}`;
  }
  const to = recipient(flight);
  return to ? `Carrying your note to ${to}` : "Carrying your note";
}

function flyingStats(
  flight: Flight,
  left: number | undefined,
  short: boolean,
): [Stat, Stat, Stat] {
  return [
    {
      value: left === undefined ? "–" : short ? seconds(left) : duration(left),
      label: "Lands in",
    },
    {
      value: flight.input ? `${flight.input.bird.speedMph} mph` : "–",
      label: "Speed",
    },
    {
      value: ALTITUDES[hash32(flight.id) % ALTITUDES.length],
      label: "Altitude",
    },
  ];
}

function roostingStats(
  flight: Flight,
  roost: NonNullable<ReturnType<typeof roostAt>>,
  arrive: number | undefined,
  timeZone: string,
): [Stat, Stat, Stat] {
  return [
    {
      value: clockTime(new Date(roost.segment.endMs), timeZone),
      label: "Takes off again",
    },
    {
      value: arrive === undefined ? "–" : roughly(arrive, timeZone),
      label: "Lands, roughly",
    },
    {
      value: ROOSTS[hash32(`${flight.id}${roost.index}`) % ROOSTS.length],
      label: "Tonight's roost",
    },
  ];
}

export function trackerView(
  flight: Flight,
  nowMs: number,
  timeZone: string,
  units: Units,
): TrackerView {
  const { state, frac, night } = position(flight, nowMs);
  const roost = state === "roosting" ? roostAt(flight.plan, nowMs) : undefined;
  const total = inUnits(totalMi(flight), units);
  const arrive = flight.arriveAt ?? flight.plan?.arriveAtMs;
  const short =
    arrive !== undefined && arrive - flight.releaseAt < SHORT_FLIGHT_MS;
  const left = arrive === undefined ? undefined : Math.max(0, arrive - nowMs);
  const copy = {
    bird: flight.bird.name,
    place: placeAt(flight, nowMs),
    from: flight.from.label,
    to: flight.to.label,
  };
  return {
    state,
    chip: STATES[state].chip,
    headline: STATES[state].headline(copy),
    sub: subLine(flight, roost),
    fromLabel: flight.from.label,
    toLabel: flight.to.label,
    progress: {
      frac,
      text: `${rounded(total * frac, total)} of ${rounded(total, total)} ${units}`,
    },
    stats: roost
      ? roostingStats(flight, roost, arrive, timeZone)
      : flyingStats(flight, left, short),
    night,
    tickMs: short ? 1000 : 10_000,
    ...pins(flight),
  };
}

export function Tracker({
  flight,
  offsetMs,
  timeZone,
  units,
}: {
  flight: Flight;
  offsetMs: number;
  timeZone: string;
  units: Units;
}) {
  const [nowMs, setNowMs] = useState(() => Date.now() + offsetMs);
  const view = trackerView(flight, nowMs, timeZone, units);

  useEffect(() => {
    const timer = setInterval(
      () => setNowMs(Date.now() + offsetMs),
      view.tickMs,
    );
    return () => clearInterval(timer);
  }, [offsetMs, view.tickMs]);

  const percent = Math.round(view.progress.frac * 100);

  return (
    <section
      className={styles.tracker}
      data-state={view.state}
      data-night={view.night ? "true" : "false"}
    >
      <div className={styles.map}>
        {flight.plan && (
          <MapView
            flightId={flight.id}
            from={flight.from}
            to={flight.to}
            plan={flight.plan}
            distanceMi={totalMi(flight)}
            bird={flight.bird}
            offsetMs={offsetMs}
            bottomPadding={CARD_PX}
            night={view.night}
            loftLabel={view.loftLabel}
            sillLabel={view.sillLabel}
          />
        )}
      </div>
      <header className={styles.top}>
        <Link
          href="/flights"
          aria-label="Back to flights"
          className={styles.back}
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path
              d="M15 5l-7 7 7 7"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <div className={styles.title}>
          <p className={styles.route}>
            <span>{flight.bird.name}</span>
            <span aria-label="to">→</span>
            <span>{view.toName}</span>
          </p>
          <span className={styles.chip}>
            {view.state === "flying" && (
              <span className={styles.pulse} aria-hidden="true" />
            )}
            {view.chip}
          </span>
        </div>
      </header>
      <div className={styles.card}>
        <div className={styles.handle} aria-hidden="true" />
        <div className={styles.who}>
          <span className={styles.avatar}>
            <Bird
              look={flight.bird.look as Look}
              gear={flight.bird.gear as GearId[]}
              pose={view.state === "roosting" ? "sleep" : "perched"}
              animated={false}
              size={44}
            />
          </span>
          <div className={styles.words}>
            <h1 className={styles.headline}>{view.headline}</h1>
            <p className={styles.sub}>{view.sub}</p>
          </div>
        </div>
        <div className={styles.progress}>
          <div
            className={styles.track}
            role="progressbar"
            aria-label="Distance flown"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-valuetext={view.progress.text}
          >
            <div className={styles.fill} style={{ width: `${percent}%` }} />
          </div>
          <div className={styles.ends}>
            <span>{view.fromLabel}</span>
            <span className={styles.miles}>{view.progress.text}</span>
            <span>{view.toLabel}</span>
          </div>
        </div>
        <div className={styles.stats}>
          {view.stats.map((s) => (
            <p key={s.label} className={styles.stat}>
              <strong className={styles.value}>{s.value}</strong>
              <span className={styles.label}>{s.label}</span>
            </p>
          ))}
        </div>
        <TrackerDelay flight={flight} nowMs={nowMs} />
        <TrackerEarn flight={flight} nowMs={nowMs} />
      </div>
    </section>
  );
}
