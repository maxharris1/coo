"use client";

import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import type { SyncPayload } from "@/components/sync";
import { config } from "@/lib/config";
import { greeting } from "@/lib/format";
import type { LoftItem } from "./loftArt";
import { LoftScene, useReducedMotion } from "./LoftScene";
import { loftTime, type LoftTime } from "./loftTime";
import styles from "./MainTop.module.css";

const { recheckMs, crossFadeMs } = config.loft.times;

export type LoftLook = { time: LoftTime; leaving: LoftTime | null };

export function useLoftTime({
  loft,
  timeZone,
  offsetMs,
  reduced,
}: {
  loft: SyncPayload["me"]["loft"];
  timeZone: string;
  offsetMs: number;
  reduced: boolean;
}): LoftLook {
  const [look, setLook] = useState<LoftLook>(() => ({
    time: loftTime(Date.now() + offsetMs, loft, timeZone),
    leaving: null,
  }));
  const lat = loft?.lat;
  const lon = loft?.lon;

  useEffect(() => {
    const spot = lat === undefined || lon === undefined ? null : { lat, lon };
    let interval: ReturnType<typeof setInterval> | undefined;
    const check = () => {
      const time = loftTime(Date.now() + offsetMs, spot, timeZone);
      setLook((now) =>
        now.time === time ? now : { time, leaving: reduced ? null : now.time },
      );
    };
    const sync = () => {
      clearInterval(interval);
      if (document.hidden) {
        setLook((now) => (now.leaving ? { ...now, leaving: null } : now));
        return;
      }
      check();
      interval = setInterval(check, recheckMs);
    };
    sync();
    document.addEventListener("visibilitychange", sync);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", sync);
    };
  }, [lat, lon, timeZone, offsetMs, reduced]);

  useEffect(() => {
    if (!look.leaving) return;
    const fade = setTimeout(
      () => setLook((now) => ({ ...now, leaving: null })),
      crossFadeMs,
    );
    return () => clearTimeout(fade);
  }, [look]);

  return look;
}

const INK = "#2A2140";

const ADD_ON_ART: Partial<Record<string, LoftItem>> = {
  "espresso-cart": "cart",
  "flower-boxes": "planters",
  weathervane: "vane",
};

function loftItems({ hasBirdbath, loftItems }: SyncPayload["me"]): LoftItem[] {
  const addOns = loftItems.flatMap((id) => ADD_ON_ART[id] ?? []);
  return hasBirdbath ? ["birdbath", ...addOns] : addOns;
}

function SeedIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3 C17 7 19 12 12 21 C5 12 7 7 12 3 Z"
        fill="#FFC93C"
        stroke={INK}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M12 8 V16" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 7 H20 M4 12 H20 M4 17 H20"
        fill="none"
        stroke={INK}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <g
        fill="none"
        stroke={INK}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 4 Q18 5 18 13 L20 17 H4 L6 13 Q6 5 12 4 Z" />
        <path d="M10 20 Q12 22 14 20" />
      </g>
    </svg>
  );
}

export function MainTopView({
  data,
  nowMs,
  look: { time, leaving },
}: {
  data: SyncPayload;
  nowMs: number;
  look: LoftLook;
}) {
  const { seeds, timezone } = data.me;
  const { unread } = data;
  const { sky, textColor } = config.loft.times[time];
  return (
    <section
      className={styles.top}
      style={
        {
          background: sky[0].color,
          color: textColor,
          "--hero-ring": textColor,
        } as CSSProperties
      }
    >
      <header className={styles.header}>
        <p className={styles.wordmark}>coo</p>
        <div className={styles.actions}>
          <Link
            href="/notifications"
            className={styles.bell}
            aria-label={
              unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
            }
          >
            <BellIcon />
            {unread > 0 && (
              <span className={styles.badge} aria-hidden="true">
                {unread}
              </span>
            )}
          </Link>
          <Link
            href="/more"
            className={styles.menu}
            aria-label="Open the post office menu"
          >
            <MenuIcon />
          </Link>
          <Link
            href="/shop"
            className={styles.seeds}
            aria-label={`Seed balance, ${seeds} ${seeds === 1 ? "seed" : "seeds"}. Open the seed store`}
          >
            <SeedIcon />
            <span>{seeds}</span>
          </Link>
        </div>
      </header>
      <h1 className={styles.greeting}>
        {greeting(nowMs, timezone, data.birds)}
      </h1>
      <div className={styles.loft}>
        {[leaving, time].map(
          (layer) =>
            layer && (
              <div
                key={layer}
                className={
                  layer === time && leaving ? styles.fadeIn : styles.layer
                }
                style={{
                  background: config.loft.times[layer].sky[0].color,
                  animationDuration:
                    layer === time && leaving ? `${crossFadeMs}ms` : undefined,
                }}
                data-time={layer}
                aria-hidden={layer === leaving || undefined}
                inert={layer === leaving}
              >
                <LoftScene
                  birds={data.birds}
                  perches={data.me.perches}
                  egg={data.egg}
                  items={loftItems(data.me)}
                  time={layer}
                />
              </div>
            ),
        )}
      </div>
    </section>
  );
}

export function MainTop({
  data,
  nowMs,
  offsetMs,
}: {
  data: SyncPayload;
  nowMs: number;
  offsetMs: number;
}) {
  const look = useLoftTime({
    loft: data.me.loft,
    timeZone: data.me.timezone,
    offsetMs,
    reduced: useReducedMotion(),
  });
  return <MainTopView data={data} nowMs={nowMs} look={look} />;
}
