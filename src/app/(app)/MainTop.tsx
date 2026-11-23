import Link from "next/link";
import { Bird, perchedHeight, type GearId, type Look } from "@/components/Bird";
import type { SyncPayload } from "@/components/sync";
import { greeting, isAway } from "@/lib/format";
import styles from "./MainTop.module.css";

type FlockBird = SyncPayload["birds"][number];

const INK = "#2A2140";
const ILLUSTRATIONS = "/assets/svg/illustrations";
const VIEW_W = 390;
const VIEW_H = 230;
type Spot = { x: number; y: number; scale: number };
const LEDGE_LAYOUTS: readonly (readonly Spot[])[] = [
  [],
  [{ x: 192, y: 112, scale: 0.82 }],
  [
    { x: 192, y: 112, scale: 0.82 },
    { x: 288, y: 116, scale: 0.78 },
  ],
  [
    { x: 152, y: 117, scale: 0.7 },
    { x: 229, y: 121, scale: 0.7 },
    { x: 305, y: 117, scale: 0.7 },
  ],
  [
    { x: 152, y: 126, scale: 0.62 },
    { x: 207, y: 130, scale: 0.62 },
    { x: 262, y: 126, scale: 0.62 },
    { x: 315, y: 130, scale: 0.62 },
  ],
  [
    { x: 150, y: 132, scale: 0.56 },
    { x: 193, y: 136, scale: 0.56 },
    { x: 236, y: 132, scale: 0.56 },
    { x: 279, y: 136, scale: 0.56 },
    { x: 322, y: 132, scale: 0.56 },
  ],
];
const LEDGE_BIRD_SIZE = 120;

type Box = { x: number; y: number; w: number; h: number };

const SLEEPER_BOX: Box = { x: 49, y: 159, w: 44, h: 34 };
const OUT_TAG_BOX: Box = { x: 114, y: 138, w: 36, h: 18 };

const pct = (n: number, of: number) => `${(n / of) * 100}%`;

function listNames(names: string[]): string {
  return names.length < 2
    ? names.join("")
    : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

function describeScene(
  ledge: FlockBird[],
  sleeper: FlockBird | undefined,
  away: FlockBird | undefined,
): string {
  const parts = [
    ledge.length > 0 &&
      `${listNames(ledge.map((b) => b.name))} ${ledge.length === 1 ? "stands" : "stand"} on the ledge`,
    sleeper && `${sleeper.name} is asleep in the coop`,
    away && `${away.name}'s door has an OUT tag on it`,
  ].filter((p): p is string => Boolean(p));
  const body =
    parts.length < 2
      ? parts.join("")
      : `${parts.slice(0, -1).join(", ")}, and ${parts.at(-1)}`;
  return body ? `Your rooftop loft. ${body}.` : "Your rooftop loft.";
}

function LoftScene({ birds }: { birds: FlockBird[] }) {
  const home = birds.filter((b) => !isAway(b.status));
  const sleeper = home.find((b) => b.tired);
  const ledge = home
    .filter((b) => b !== sleeper)
    .slice(0, LEDGE_LAYOUTS.length - 1);
  const spots = LEDGE_LAYOUTS[ledge.length];
  const away = birds.find((b) => isAway(b.status));
  const targets: { bird: FlockBird; box: Box }[] = [
    ...(sleeper ? [{ bird: sleeper, box: SLEEPER_BOX }] : []),
    ...(away ? [{ bird: away, box: OUT_TAG_BOX }] : []),
    ...ledge.map((bird, i) => {
      const { x, y, scale } = spots[i];
      return {
        bird,
        box: {
          x,
          y,
          w: LEDGE_BIRD_SIZE * scale,
          h: perchedHeight(LEDGE_BIRD_SIZE) * scale,
        },
      };
    }),
  ];

  return (
    <div className={styles.loft}>
      <svg
        className={styles.scene}
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label={describeScene(ledge, sleeper, away)}
      >
        <g fill="#8CCDEE">
          <rect x="0" y="120" width="46" height="110" />
          <rect x="52" y="88" width="38" height="142" />
          <rect x="188" y="104" width="54" height="126" />
          <rect x="250" y="70" width="40" height="160" />
          <rect x="298" y="112" width="92" height="118" />
        </g>
        <image
          href={`${ILLUSTRATIONS}/water-tower.svg`}
          x="302"
          y="24"
          width="70"
          height="92"
        />
        <image
          className={styles.drift}
          href={`${ILLUSTRATIONS}/cloud.svg`}
          x="194"
          y="18"
          width="64"
          height="31"
        />
        <image
          href={`${ILLUSTRATIONS}/cloud.svg`}
          x="104"
          y="12"
          width="48"
          height="23"
        />
        <rect
          x="-6"
          y="196"
          width="402"
          height="44"
          fill="#F08A6B"
          stroke={INK}
          strokeWidth="2.5"
        />
        <path
          d="M-6 212 H396 M40 196 V212 M120 196 V212 M200 196 V212 M280 196 V212 M360 196 V212 M80 212 V240 M160 212 V240 M240 212 V240 M320 212 V240"
          stroke={INK}
          strokeWidth="1.6"
          opacity=".45"
          fill="none"
        />
        <image
          href={`${ILLUSTRATIONS}/coop.svg`}
          x="6"
          y="54"
          width="186"
          height="148"
        />
        {sleeper && (
          <g data-sleeper="">
            <circle
              cx="66"
              cy="176"
              r="17"
              fill="#7A7396"
              stroke="#FFF4DC"
              strokeWidth="2"
            />
            <path
              d="M68 174 q5 4 10 0"
              stroke="#FFF4DC"
              strokeWidth="2.4"
              fill="none"
              strokeLinecap="round"
            />
            <path
              d="M82 175 L93 179 L82 183 Z"
              fill="#FFC93C"
              stroke="#FFF4DC"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <text x="84" y="150" className={styles.snooze}>
              z
            </text>
            <text
              x="74"
              y="160"
              className={`${styles.snooze} ${styles.snoozeLate}`}
            >
              z
            </text>
          </g>
        )}
        {away && (
          <g>
            <path d="M132 124 V140" stroke={INK} strokeWidth="2" fill="none" />
            <g transform="rotate(-6 132 147)">
              <rect
                x="114"
                y="138"
                width="36"
                height="18"
                rx="4"
                fill="#FFFBF0"
                stroke={INK}
                strokeWidth="2"
              />
              <text x="132" y="151" className={styles.tag}>
                OUT
              </text>
            </g>
          </g>
        )}
        {ledge.map((b, i) => {
          const spot = spots[i];
          return (
            <g
              key={b.id}
              data-ledge-bird=""
              transform={`translate(${spot.x} ${spot.y}) scale(${spot.scale})`}
            >
              <Bird
                look={b.look as Look}
                breed={b.breed}
                gear={b.gear as GearId[]}
                size={LEDGE_BIRD_SIZE}
              />
            </g>
          );
        })}
      </svg>
      {targets.map(({ bird, box }) => (
        <Link
          key={bird.id}
          href={`/birds/${bird.id}`}
          aria-label={`Open ${bird.name}`}
          data-scene-bird=""
          className={styles.birdLink}
          style={{
            left: pct(box.x + box.w / 2, VIEW_W),
            top: pct(box.y + box.h / 2, VIEW_H),
            width: pct(box.w, VIEW_W),
            height: pct(box.h, VIEW_H),
          }}
        />
      ))}
    </div>
  );
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

export function MainTop({ data, nowMs }: { data: SyncPayload; nowMs: number }) {
  const { seeds, timezone } = data.me;
  const { unread } = data;
  return (
    <section className={styles.top}>
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
      <LoftScene birds={data.birds} />
    </section>
  );
}
