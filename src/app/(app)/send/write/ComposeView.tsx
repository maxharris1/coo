import Link from "next/link";
import emptyStates from "../../../../../assets/copy/empty-states.json";
import { canRelease, type Counter } from "./compose";
import styles from "./Compose.module.css";

export type Recipient = { name: string; line: string };

export type ComposeViewProps = {
  recipient: Recipient;
  note: string;
  counter: Counter;
  birdName: string | null;
  sending: boolean;
  onNote: (note: string) => void;
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

export function ComposeView({
  recipient,
  note,
  counter,
  birdName,
  sending,
  onNote,
  onRelease,
}: ComposeViewProps) {
  return (
    <main className={styles.screen}>
      <Header />

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

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.release}
          disabled={!canRelease(note, counter, birdName, sending)}
          onClick={onRelease}
        >
          <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 14 C7 6 13 4 21 5 C20 9 17 12 13 13 C15 14 16 15 18 15 C14 19 7 19 3 14 Z" />
          </svg>
          <span>{birdName ? `Release ${birdName}` : "Release"}</span>
        </button>
        <p className={styles.hint}>
          {birdName
            ? "No take-backs once the bird is airborne."
            : NO_RESTED_BIRDS}
        </p>
      </div>
    </main>
  );
}
