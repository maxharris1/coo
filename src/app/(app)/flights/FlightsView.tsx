import Link from "next/link";
import emptyStates from "../../../../assets/copy/empty-states.json";
import { Loader } from "@/components/Loader";
import type { Units } from "@/lib/format";
import type { FlightsPage } from "@/server/services/flights/list";
import {
  earlierRows,
  flightsView,
  type ChipTone,
  type Direction,
  type FlightsRow,
} from "./flightsViewModel";
import { FlightMapPreview } from "./FlightMapPreview";
import { jobCards, type JobBird, type Jobs } from "./JobCards";
import styles from "./Flights.module.css";

export type List =
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  | ({ kind: "ready"; loadingMore: boolean } & FlightsPage);

export type FlightsViewProps = {
  list: List;
  birds: JobBird[];
  jobs: Jobs;
  nowMs: number;
  offsetMs: number;
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

const ARROW: Record<Direction, string> = {
  sent: "M5 11 11 5M6 5h5v5",
  received: "M11 5 5 11M5 6v5h5",
};

function AirCard({
  row,
  nowMs,
  offsetMs,
}: {
  row: FlightsRow;
  nowMs: number;
  offsetMs: number;
}) {
  return (
    <Link
      href={`/flights/${row.id}`}
      aria-label={row.label}
      data-state={row.state}
      className={styles.airCard}
    >
      <div className={styles.preview}>
        <FlightMapPreview
          flight={row.flight}
          state={row.state}
          nowMs={nowMs}
          offsetMs={offsetMs}
        />
      </div>
      <div className={styles.airBody}>
        <span className={styles.airTop}>
          <span className={styles.rowTitle}>{row.bird}</span>
          {row.chip && (
            <span className={`${styles.chip} ${TONE[row.chip.tone]}`}>
              {row.chip.text}
            </span>
          )}
        </span>
        <span className={styles.who}>
          <span
            className={styles.badge}
            data-direction={row.direction}
            aria-hidden="true"
          >
            <svg width="12" height="12" viewBox="0 0 16 16">
              <path
                d={ARROW[row.direction]}
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
          <span>{row.other}</span>
        </span>
        {row.line && <span className={styles.line}>{row.line}</span>}
      </div>
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
  jobs,
  nowMs,
  offsetMs,
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
  const [air, landed] = view.sections;
  const working = jobCards({ birds, jobs, timeZone, nowMs, offsetMs });
  const earlier = earlierRows(list.earlier, nowMs, timeZone, units);
  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <h1 className={styles.title}>Flights</h1>
        <span className={styles.pill}>{view.pill}</span>
      </header>
      <section className={styles.section}>
        <h2 className={styles.heading}>{air.title}</h2>
        {air.rows.map((row) => (
          <AirCard key={row.id} row={row} nowMs={nowMs} offsetMs={offsetMs} />
        ))}
        {working}
        {air.rows.length === 0 && working.length === 0 && (
          <p className={styles.emptyCard}>{EMPTY_LINE}</p>
        )}
      </section>
      {landed.rows.length > 0 && (
        <section className={styles.doneList}>
          <h2 className={styles.heading}>{landed.title}</h2>
          {landed.rows.map((row) => (
            <DoneRow key={row.id} row={row} />
          ))}
        </section>
      )}
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
