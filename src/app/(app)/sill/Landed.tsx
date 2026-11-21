import Link from "next/link";
import { Bird, type GearId, type Look } from "@/components/Bird";
import { Landing } from "@/components/Takeoff";
import { config } from "@/lib/config";
import type { SyncVisit } from "@/server/services/visits/syncRead";
import {
  countdownLine,
  postmark,
  tripSummary,
  type LandedState,
  type SenderCity,
} from "./landedModel";
import { Postmark } from "./Postmark";
import styles from "./Landed.module.css";

const ILLUSTRATIONS = "/assets/svg/illustrations";
const BIRD_SIZE = 188;
const { snackCost } = config.game.seeds;

type LandedProps = {
  visit: SyncVisit;
  state: LandedState;
  city: SenderCity | null;
  nowMs: number;
  timeZone: string;
  animate: boolean;
  snacking: boolean;
  onSnack(): void;
};

function postmarkLabel(
  createdAt: number,
  city: SenderCity | null,
  timeZone: string,
): string {
  const day = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "long",
    day: "numeric",
  }).format(createdAt);
  return `Postmark: Pigeon Post${city ? `, ${city.name}` : ""}, ${day}`;
}

function Sill({ visit, animate }: { visit: SyncVisit; animate: boolean }) {
  const bird = {
    look: visit.bird.look as Look,
    breed: visit.bird.breed,
    gear: visit.bird.gear as GearId[],
    size: BIRD_SIZE,
  };
  return (
    <div
      className={styles.sky}
      role="img"
      aria-label={`${visit.bird.name} stands on your windowsill with a note tied to its leg.`}
    >
      <svg className={styles.rays} viewBox="0 0 200 200" aria-hidden="true">
        <image
          href={`${ILLUSTRATIONS}/sunburst.svg`}
          width="200"
          height="200"
        />
      </svg>
      <svg
        className={styles.scene}
        viewBox="0 0 390 196"
        width="390"
        height="196"
        aria-hidden="true"
      >
        <rect
          className={styles.sill}
          x="-200"
          y="166"
          width="790"
          height="40"
        />
        <path className={styles.sillEdge} d="M-200 178 H590" />
        <image
          href={`${ILLUSTRATIONS}/flowerpot.svg`}
          x="300"
          y="70"
          width="62"
          height="100"
        />
        <circle className={styles.seedDot} cx="88" cy="160" r="3" />
        <circle className={styles.seedDot} cx="102" cy="162" r="2.2" />
      </svg>
      <div className={styles.perch} aria-hidden="true">
        {animate ? <Landing {...bird} /> : <Bird {...bird} pose="landed" />}
      </div>
    </div>
  );
}

function NoteCard({
  visit,
  city,
  timeZone,
}: Pick<LandedProps, "visit" | "city" | "timeZone">) {
  const stamp = postmark(visit.note.createdAt, city, timeZone);
  const owner = visit.owner.name;
  return (
    <article className={styles.note}>
      <span className={styles.stamp}>
        <Postmark
          date={stamp.date}
          place={stamp.place}
          label={postmarkLabel(visit.note.createdAt, city, timeZone)}
        />
      </span>
      <div className={styles.noteFrom}>NOTE FROM {owner.toUpperCase()}</div>
      <p className={styles.noteBody}>{visit.note.body}</p>
      <p className={styles.signOff}>{owner.charAt(0).toUpperCase()}.</p>
    </article>
  );
}

export function Landed({
  visit,
  state,
  city,
  nowMs,
  timeZone,
  animate,
  snacking,
  onSnack,
}: LandedProps) {
  const name = visit.bird.name;
  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <Link href="/" aria-label="Back to the loft" className={styles.back}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path className={styles.backArrow} d="M15 5 L8 12 L15 19" />
          </svg>
        </Link>
        <div className={styles.chip}>On your windowsill</div>
      </header>

      <div className={styles.intro}>
        <h1 className={styles.title}>{name} has landed</h1>
        <p className={styles.summary}>{tripSummary(visit, city, "mi")}</p>
      </div>

      <Sill visit={visit} animate={animate} />

      <main className={styles.paper}>
        <NoteCard visit={visit} city={city} timeZone={timeZone} />
        <div className={styles.actions}>
          {state === "gone" ? (
            <GoneHome birdName={name} ownerId={visit.owner.id} />
          ) : (
            <>
              <Link href={`/sill/${visit.id}/reply`} className={styles.primary}>
                Send {name} home with a reply
              </Link>
              {!visit.snackGiven && (
                <button
                  type="button"
                  className={styles.snack}
                  disabled={snacking}
                  onClick={onSnack}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      className={styles.seed}
                      d="M12 3 C17 7 19 12 12 21 C5 12 7 7 12 3 Z"
                    />
                  </svg>
                  <span>
                    Give {name} a snack first ({snackCost} seeds)
                  </span>
                </button>
              )}
              <p className={styles.countdown}>{countdownLine(visit, nowMs)}</p>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

export function GoneHome({
  birdName,
  ownerId,
}: {
  birdName: string;
  ownerId: string | null;
}) {
  const href =
    ownerId === null
      ? "/send"
      : `/send/write?to=${encodeURIComponent(ownerId)}`;
  return (
    <>
      <p className={styles.gone}>
        {birdName} has gone home. Reply with one of your own birds.
      </p>
      <Link href={href} className={styles.primary}>
        Compose
      </Link>
    </>
  );
}
