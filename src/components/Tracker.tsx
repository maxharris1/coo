"use client";

import { useEffect, useState } from "react";
import {
  type FlightPlan,
  hash32,
  isDaylight,
  positionAt,
} from "@/lib/flight/engine";
import { duration, fuzzyWhen, inUnits, type Units } from "@/lib/format";
import Link from "next/link";
import type { Flight } from "@/server/services/flights/shape";
import { Bird, type GearId, type Look } from "./Bird";
import { FlightLog, placeNear } from "./FlightLog";
import { MapView, birdState, type BirdState, type LoftAt } from "./MapView";
import styles from "./Tracker.module.css";
import { TrackerDelay } from "./TrackerDelay";
import { TrackerEarn } from "./TrackerEarn";

type TrackerState = BirdState;
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
  toName: string;
  loftLabel: string;
  sillLabel: string;
  loftAt: LoftAt;
};

type Copy = {
  bird: string;
  place: string | undefined;
  from: string;
  to: string;
  friend: string;
};

const onTheWay = (c: Copy) => `${c.bird} is on the way to ${c.friend}`;

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
    headline: (c) => (c.place ? `${c.bird} is over ${c.place}` : onTheWay(c)),
  },
  roosting: {
    chip: "Roosting",
    headline: (c) => (c.place ? `Asleep near ${c.place}` : onTheWay(c)),
  },
  delayed: {
    chip: "Delayed",
    headline: (c) => (c.place ? `Last seen near ${c.place}` : onTheWay(c)),
  },
  landed: { chip: "Landed", headline: (c) => `${c.bird} landed at ${c.to}` },
};

const ALTITUDES = ["Rooftop", "Lowish", "Quite high"];
const ROOSTS = ["A barn", "A water tower", "A ledge"];
const COUNTS = ["one", "two", "three", "four", "five", "six", "seven"];
const TICK_MS = 10_000;
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
    state: birdState(p.state),
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

function totalMi(flight: Flight): number {
  return flight.distanceMi ?? flight.plan?.distanceMi ?? 0;
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

function capName(name: string, max = 9): string {
  const chars = Array.from(name);
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : name;
}

function recipient(flight: Flight): string | undefined {
  return flight.counterpart?.name ?? flight.guestName;
}

function headedTo(flight: Flight): string {
  if (flight.kind === "return") {
    return flight.role === "mine" ? "you" : flight.owner.name;
  }
  return flight.role === "incoming"
    ? "you"
    : (recipient(flight) ?? flight.to.label);
}

type Roost = ReturnType<typeof roostAt>;
type Chrome = {
  toName: string;
  loftLabel: string;
  sillLabel: string;
  loftAt: LoftAt;
  sub: (roost: Roost) => string;
};

function nights(roost: Roost, where: string): string | undefined {
  if (!roost || roost.count >= COUNTS.length) return undefined;
  return `Night ${COUNTS[roost.index]} of a ${COUNTS[roost.count]}-day flight ${where}`;
}

const CHROME: Record<
  `${Flight["role"]}:${Flight["kind"]}`,
  (flight: Flight) => Chrome
> = {
  "mine:delivery": (flight) => {
    const to = recipient(flight);
    return {
      toName: to ?? flight.to.label,
      loftLabel: "Your loft",
      sillLabel: to ? `${to}, ${flight.to.label}` : flight.to.label,
      loftAt: "from",
      sub: (roost) =>
        nights(roost, `to ${to ?? flight.to.label}`) ??
        (to ? `Carrying your note to ${to}` : "Carrying your note"),
    };
  },
  "incoming:delivery": (flight) => ({
    toName: "You",
    loftLabel: `${flight.owner.name}, ${flight.from.label}`,
    sillLabel: "Your sill",
    loftAt: "from",
    sub: () => "Carrying a note for you",
  }),
  "mine:return": (flight) => {
    const host = recipient(flight);
    return {
      toName: "You",
      loftLabel: "Your loft",
      sillLabel: host ? `${host}, ${flight.from.label}` : flight.from.label,
      loftAt: "to",
      sub: (roost) =>
        nights(roost, "home") ??
        (host
          ? flight.hasNote
            ? `Bringing a reply from ${host}`
            : `Coming home from ${host}`
          : "Heading home"),
    };
  },
  "incoming:return": (flight) => {
    const owner = flight.owner.name;
    return {
      toName: owner,
      loftLabel: `${owner}, ${flight.to.label}`,
      sillLabel: "Your sill",
      loftAt: "to",
      sub: () =>
        flight.hasNote
          ? `Carrying a note to ${owner}`
          : `Heading back to ${owner}`,
    };
  },
};

function cruiseStats(flight: Flight): [Stat, Stat] {
  return [
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

function flyingStats(flight: Flight, lands: string): [Stat, Stat, Stat] {
  return [{ value: lands, label: "Lands" }, ...cruiseStats(flight)];
}

function landedStats(
  flight: Flight,
  arrive: number | undefined,
  nowMs: number,
): [Stat, Stat, Stat] {
  const left = arrive === undefined ? undefined : Math.max(0, arrive - nowMs);
  const short =
    arrive !== undefined && arrive - flight.releaseAt < SHORT_FLIGHT_MS;
  return [
    {
      value: left === undefined ? "–" : short ? seconds(left) : duration(left),
      label: "Lands in",
    },
    ...cruiseStats(flight),
  ];
}

function roostingStats(
  flight: Flight,
  roost: NonNullable<ReturnType<typeof roostAt>>,
  lands: string,
): [Stat, Stat, Stat] {
  return [
    { value: "first light", label: "Takes off again" },
    { value: lands, label: "Lands, roughly" },
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
  const lands = arrive === undefined ? "–" : fuzzyWhen(arrive, nowMs, timeZone);
  const { sub, ...pins } = CHROME[`${flight.role}:${flight.kind}`](flight);
  const copy = {
    bird: flight.bird.name,
    place: placeNear(flight, frac),
    from: flight.from.label,
    to: flight.to.label,
    friend: headedTo(flight),
  };
  return {
    state,
    chip: STATES[state].chip,
    headline: STATES[state].headline(copy),
    sub: sub(roost),
    fromLabel: flight.from.label,
    toLabel: flight.to.label,
    progress: {
      frac,
      text: `${rounded(total * frac, total)} of ${rounded(total, total)} ${units}`,
    },
    stats: roost
      ? roostingStats(flight, roost, lands)
      : state === "landed"
        ? landedStats(flight, arrive, nowMs)
        : flyingStats(flight, lands),
    night,
    ...pins,
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
    const timer = setInterval(() => setNowMs(Date.now() + offsetMs), TICK_MS);
    return () => clearInterval(timer);
  }, [offsetMs]);

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
            loftAt={view.loftAt}
            state={view.state}
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
          <p
            className={styles.route}
            aria-label={`${flight.bird.name} to ${view.toName}`}
          >
            <span>{capName(flight.bird.name)}</span>
            <span aria-label="to" className={styles.arrow}>
              →
            </span>
            <span>{capName(view.toName)}</span>
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
            <h1 className={`${styles.headline} coo-wrap`}>{view.headline}</h1>
            <p className={`${styles.sub} coo-wrap`}>{view.sub}</p>
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
            <span className="coo-truncate">{view.fromLabel}</span>
            <span className={styles.miles}>{view.progress.text}</span>
            <span className={`${styles.to} coo-truncate`}>
              {view.toLabel}
            </span>
          </div>
        </div>
        <div className={styles.stats}>
          {view.stats.map((s) => (
            <p key={s.label} className={styles.stat}>
              <strong className={`${styles.value} coo-wrap`}>{s.value}</strong>
              <span className={styles.label}>{s.label}</span>
            </p>
          ))}
        </div>
        <TrackerDelay flight={flight} nowMs={nowMs} />
        <TrackerEarn flight={flight} nowMs={nowMs} />
        <FlightLog flight={flight} nowMs={nowMs} timeZone={timeZone} />
      </div>
    </section>
  );
}
