import Link from "next/link";
import type { ComponentProps } from "react";
import emptyStates from "../../../../assets/copy/empty-states.json";
import { Bird, type GearId, type Look } from "@/components/Bird";
import { Loader } from "@/components/Loader";
import { onJob } from "../earn/JobsPanel";
import type { Units } from "@/lib/format";
import type { FlightsPage } from "@/server/services/flights/list";
import {
  earlierRows,
  flightsView,
  type ChipTone,
  type FlightsRow,
} from "./flightsViewModel";
import { JobsSection } from "./JobsSection";
import styles from "./Flights.module.css";

export type List =
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  | ({ kind: "ready"; loadingMore: boolean } & FlightsPage);

export type FlightsViewProps = {
  list: List;
  birds: ComponentProps<typeof JobsSection>["birds"];
  nowMs: number;
  timeZone: string;
  units: Units;
  onMore: () => void;
  onRetry: () => void;
};

const EMPTY_LINE = emptyStates.find((s) => s.state === "No flights")!.text;

const TONE: Record<ChipTone, string> = {
  card: styles.chipCard,
  sun: styles.chipSun,
  lilac: styles.chipLilac,
  tomato: styles.chipTomato,
  mint: styles.chipMint,
};

function LiveRow({ row }: { row: FlightsRow }) {
  const pct = Math.round(row.frac * 100);
  const { bird } = row.flight;
  return (
    <Link
      href={`/flights/${row.id}`}
      className={styles.card}
      data-state={row.state}
    >
      <span className={styles.top}>
        <span className={styles.avatar}>
          <span className={styles.avatarBird}>
            <Bird
              look={bird.look as Look}
              gear={bird.gear as GearId[]}
              animated={false}
              size={86}
            />
          </span>
        </span>
        <span className={styles.text}>
          <span className={styles.rowTitle}>{row.title}</span>
          <span className={styles.line}>{row.line}</span>
        </span>
        {row.chip && (
          <span className={`${styles.chip} ${TONE[row.chip.tone]}`}>
            {row.chip.text}
          </span>
        )}
      </span>
      <span
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${pct} percent of the way`}
        className={styles.bar}
      >
        <span className={styles.fill} style={{ width: `${pct}%` }} />
      </span>
    </Link>
  );
}

function DoneRow({ row }: { row: FlightsRow }) {
  return (
    <Link href={`/flights/${row.id}`} className={styles.done}>
      <span className={styles.doneTitle}>{row.title}</span>
      <span className={styles.doneWhen}>{row.line}</span>
    </Link>
  );
}

export function FlightsView({
  list,
  birds,
  nowMs,
  timeZone,
  units,
  onMore,
  onRetry,
}: FlightsViewProps) {
  if (list.kind === "loading") return <Loader />;
  if (list.kind === "failed") {
    return (
      <div className={styles.screen}>
        <h1 className={styles.title}>Flights</h1>
        <p role="alert" className={styles.empty}>
          {list.message}
        </p>
        <button type="button" className={styles.more} onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  const view = flightsView(list, nowMs, timeZone, units);
  const sections = view.sections.filter((s) => s.rows.length > 0);
  const earlier = earlierRows(list.earlier, nowMs, timeZone, units);
  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1 className={styles.title}>Flights</h1>
        <span className={styles.pill}>{view.pill}</span>
      </header>
      {sections.length === 0 && earlier.length === 0 && !birds.some(onJob) && (
        <p className={styles.empty}>{EMPTY_LINE}</p>
      )}
      {sections.map((s) => (
        <section
          key={s.key}
          className={s.key === "landedToday" ? styles.doneList : styles.section}
        >
          <h2 className={styles.heading}>{s.title}</h2>
          {s.rows.map((row) =>
            s.key === "landedToday" ? (
              <DoneRow key={row.id} row={row} />
            ) : (
              <LiveRow key={row.id} row={row} />
            ),
          )}
        </section>
      ))}
      <JobsSection birds={birds} timeZone={timeZone} />
      {earlier.length > 0 && (
        <section className={styles.doneList}>
          <h2 className={styles.heading}>Earlier</h2>
          {earlier.map((row) => (
            <DoneRow key={row.id} row={row} />
          ))}
        </section>
      )}
      {list.nextCursor && (
        <button
          type="button"
          className={styles.more}
          disabled={list.loadingMore}
          onClick={onMore}
        >
          Show earlier
        </button>
      )}
    </div>
  );
}
