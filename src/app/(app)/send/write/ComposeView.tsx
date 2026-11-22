import Link from "next/link";
import { Bird } from "@/components/Bird";
import emptyStates from "../../../../../assets/copy/empty-states.json";
import {
  canRelease,
  type ComposeStats,
  type Counter,
  type PickerOption,
} from "./compose";
import styles from "./Compose.module.css";

export type Recipient = { name: string; line: string };

export type ComposeRow = {
  friendId: string;
  recipient: Recipient;
  pickedId: string | null;
  tooLong: boolean;
  stats: ComposeStats | null;
  forecastHref: string;
};

export type ComposeViewProps = {
  rows: readonly ComposeRow[];
  note: string;
  counter: Counter;
  birds: PickerOption[];
  sending: boolean;
  onNote: (note: string) => void;
  onPick: (friendId: string, birdId: string) => void;
  onRelease: () => void;
};

const NO_RESTED_BIRDS =
  emptyStates.find((s) => s.state === "No rested birds")?.text ?? "";

function Header() {
  return (
    <header className={styles.header}>
      <Link
        href="/send"
        aria-label="Back to the address book"
        className={styles.back}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M15 5 L8 12 L15 19" />
        </svg>
      </Link>
      <h1 className={styles.title}>New pigeon post</h1>
    </header>
  );
}

export function NoRecipient({ message }: { message: string }) {
  return (
    <main className={styles.screen}>
      <Header />
      <section className={styles.card}>
        <p className={styles.missing}>{message}</p>
        <Link href="/send" className={styles.change}>
          Pick a friend
        </Link>
      </section>
    </main>
  );
}

function RecipientCard({ recipient }: { recipient: Recipient }) {
  return (
    <section className={styles.card}>
      <span aria-hidden="true" className={styles.avatar}>
        {recipient.name.slice(0, 1).toUpperCase()}
      </span>
      <span className={styles.who}>
        <span className={styles.name}>To {recipient.name}</span>
        <span className={styles.line}>{recipient.line}</span>
      </span>
      <Link href="/send" className={styles.change}>
        Change
      </Link>
    </section>
  );
}

function Picker({
  heading,
  birds,
  pickedId,
  tooLong,
  onPick,
}: {
  heading: string;
  birds: PickerOption[];
  pickedId: string | null;
  tooLong: boolean;
  onPick: (birdId: string) => void;
}) {
  const picked = birds.find((b) => b.id === pickedId) ?? null;
  return (
    <section className={styles.picker}>
      <h2 className={styles.label}>{heading}</h2>
      <div className={styles.birds}>
        {birds.map((b) => (
          <button
            key={b.id}
            type="button"
            className={b.id === pickedId ? styles.picked : styles.bird}
            aria-pressed={b.id === pickedId}
            disabled={b.state.kind === "blocked"}
            onClick={() => onPick(b.id)}
          >
            <span className={styles.face}>
              <span className={styles.faceBird}>
                <Bird
                  look={b.look}
                  breed={b.breed}
                  gear={b.gear}
                  animated={false}
                  size={94}
                />
              </span>
            </span>
            <span className={styles.birdName}>{b.name}</span>
            <span className={styles.speed}>{b.speed}</span>
            <span className={styles.chip}>{b.chip}</span>
            {b.state.kind === "blocked" && (
              <span className="srOnly">{b.state.reason}</span>
            )}
          </button>
        ))}
      </div>
      {tooLong && picked && (
        <p role="alert" className={styles.warning}>
          Too long for {picked.name}.
        </p>
      )}
      {picked?.state.kind === "hungry" && (
        <p role="status" className={styles.warning}>
          {picked.state.warning}
        </p>
      )}
    </section>
  );
}

function Stats({
  stats,
  forecastHref,
}: {
  stats: ComposeStats | null;
  forecastHref: string;
}) {
  if (!stats) return null;
  return (
    <section className={styles.stats}>
      <div className={styles.statGrid}>
        <div className={styles.stat}>
          <span className={styles.value}>{stats.distance}</span>
          <span className={styles.statLabel}>Distance</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.value}>{stats.flightTime}</span>
          <span className={styles.statLabel}>Flight time</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.value}>{stats.odds}</span>
          <span className={styles.statLabel}>Arrival odds</span>
        </div>
      </div>
      <div className={styles.forecast}>
        <span>{stats.forecast}</span>
        <Link href={forecastHref} className={styles.forecastLink}>
          Forecast
        </Link>
      </div>
    </section>
  );
}

export function ComposeView({
  rows,
  note,
  counter,
  birds,
  sending,
  onNote,
  onPick,
  onRelease,
}: ComposeViewProps) {
  const single = rows.length === 1 ? rows[0] : null;
  const pickedName = (row: ComposeRow) =>
    birds.find((b) => b.id === row.pickedId)?.name ?? null;
  const allPicked = rows.every((r) => pickedName(r) !== null);
  const releaseLabel = !allPicked
    ? null
    : single
      ? `Release ${pickedName(single)}`
      : `Release ${rows.length} birds`;
  const ready =
    canRelease(note, counter, releaseLabel, sending) &&
    !rows.some((r) => r.tooLong);
  const rowParts = (row: ComposeRow, heading: string) => (
    <>
      <Picker
        heading={heading}
        birds={birds}
        pickedId={row.pickedId}
        tooLong={row.tooLong && !single}
        onPick={(birdId) => onPick(row.friendId, birdId)}
      />
      <Stats stats={row.stats} forecastHref={row.forecastHref} />
    </>
  );
  return (
    <main className={styles.screen}>
      <Header />

      {single && <RecipientCard recipient={single.recipient} />}

      <section className={styles.note}>
        <label htmlFor="note" className={styles.label}>
          Your note
        </label>
        <div className={styles.paper}>
          <textarea
            id="note"
            className={styles.field}
            value={note}
            aria-describedby="note-count"
            onChange={(e) => onNote(e.target.value)}
          />
          <div className={styles.meta}>
            <span
              id="note-count"
              aria-live="polite"
              className={counter.over ? styles.over : styles.count}
            >
              {counter.text}
            </span>
            <span>It has to fit on one leg</span>
          </div>
        </div>
      </section>

      {single
        ? rowParts(single, "Who's flying?")
        : rows.map((row) => (
            <section key={row.friendId} className={styles.row}>
              <RecipientCard recipient={row.recipient} />
              {rowParts(row, `Who's flying to ${row.recipient.name}?`)}
            </section>
          ))}

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.release}
          disabled={!ready}
          onClick={onRelease}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 14 C7 6 13 4 21 5 C20 9 17 12 13 13 C15 14 16 15 18 15 C14 19 7 19 3 14 Z" />
          </svg>
          <span>{releaseLabel ?? "Release"}</span>
        </button>
        <p className={styles.hint}>
          {releaseLabel
            ? "No take-backs once the bird is airborne."
            : NO_RESTED_BIRDS}
        </p>
      </div>
    </main>
  );
}
