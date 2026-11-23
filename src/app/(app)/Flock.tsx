import Link from "next/link";
import { Bird, type GearId, type Look } from "@/components/Bird";
import type { SyncPayload } from "@/components/sync";
import styles from "./Flock.module.css";
import {
  flockRow,
  incomingCards,
  perchSlots,
  type Chip,
  type FlightLite,
  type PerchSlot,
  type Visiting,
} from "./flockRows";

type FlockBird = SyncPayload["birds"][number];

const INK = "#2A2140";

const CHIP_TONE: Record<Chip, string> = {
  Ready: "mint",
  Flying: "sun",
  Resting: "lilac",
  Scheduled: "sand",
  "On a sill": "sky",
  "On a job": "sun",
};

const SLOT_OFFER: Record<PerchSlot, { href: string; label: string } | null> = {
  roommate: { href: "/aviary/roommate", label: "A roommate is waiting" },
  egg: { href: "/aviary", label: "An egg is ready" },
  empty: null,
};

function Avatar({
  bird,
  tone,
  napping,
}: {
  bird: FlockBird;
  tone: string;
  napping: boolean;
}) {
  return (
    <span className={`${styles.avatar} ${styles[tone]}`}>
      <span className={styles.avatarBird}>
        <Bird
          look={bird.look as Look}
          breed={bird.breed}
          gear={bird.gear as GearId[]}
          pose={napping ? "sleep" : "perched"}
          animated={false}
          size={86}
        />
      </span>
    </span>
  );
}

function EnvelopeIcon() {
  return (
    <svg width="34" height="34" viewBox="0 0 24 24" aria-hidden="true">
      <rect
        x="3"
        y="6"
        width="18"
        height="13"
        rx="2.5"
        fill="#FFFBF0"
        stroke={INK}
        strokeWidth="2"
      />
      <path
        d="M3.5 7.5 L12 13.5 L20.5 7.5"
        fill="none"
        stroke={INK}
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M9 5 L16 12 L9 19"
        fill="none"
        stroke={INK}
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Flock({
  data,
  onFeed,
}: {
  data: SyncPayload;
  onFeed: (birdId: string) => void;
}) {
  const flights = data.flights as unknown as FlightLite[];
  const ctx = {
    timezone: data.me.timezone,
    nowMs: data.serverNow,
    flights,
    myVisiting: data.myVisiting as unknown as Visiting[],
  };
  const slots = perchSlots(data.birds.length, data.me.perches, data.egg);

  return (
    <main className={styles.flock}>
      {incomingCards(flights, data.serverNow, data.me.timezone).map((card) => (
        <Link
          key={card.id}
          href={`/flights/${card.id}`}
          className={styles.incoming}
        >
          <EnvelopeIcon />
          <span className={styles.incomingText}>
            <span className={styles.incomingTitle}>{card.title}</span>
            <span className={styles.incomingLine}>{card.line}</span>
          </span>
          <ChevronIcon />
        </Link>
      ))}
      <div className={styles.heading}>
        <h2 className={styles.title}>Your flock</h2>
        <Link href="/aviary" className={styles.perches}>
          {data.birds.length} of {data.me.perches} perches
        </Link>
      </div>
      <ul className={styles.rows}>
        {data.birds.map((bird) => {
          const row = flockRow(bird, ctx);
          return (
            <li key={bird.id} className={styles.row}>
              <Avatar
                bird={bird}
                tone={row.tone}
                napping={bird.busyKind === "nap"}
              />
              <Link
                href={`/birds/${bird.id}`}
                className={styles.rowLink}
                aria-label={`Open ${bird.name}`}
              >
                <span className={styles.name}>{bird.name}</span>
                <span className={styles.line}>{row.line}</span>
              </Link>
              {row.action.kind === "feed" ? (
                <button
                  type="button"
                  className={styles.feed}
                  aria-label={`Feed ${bird.name}`}
                  onClick={() => onFeed(bird.id)}
                >
                  Feed me
                </button>
              ) : (
                <span
                  className={`${styles.chip} ${styles[CHIP_TONE[row.action.chip]]}`}
                >
                  {row.action.chip}
                </span>
              )}
            </li>
          );
        })}
        {slots.map((slot, i) => {
          const offer = SLOT_OFFER[slot];
          return offer ? (
            <li
              key={slot}
              data-perch={slot}
              className={`${styles.slot} ${styles.eggSlot}`}
            >
              <Link href={offer.href} className={styles.slotLink}>
                {offer.label}
              </Link>
            </li>
          ) : (
            <li
              key={`empty-${i}`}
              data-perch="empty"
              className={styles.slot}
              aria-label="Empty perch"
            />
          );
        })}
      </ul>
    </main>
  );
}
