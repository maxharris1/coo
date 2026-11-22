import Link from "next/link";
import { Bird, type Breed, type GearId, type Look } from "@/components/Bird";
import type { Counter, ReplyModel } from "./replyModel";
import styles from "./Reply.module.css";

export type ReplyBird = { look: Look; breed: Breed; gear: readonly GearId[] };

export type ReplyViewProps = {
  backHref: string;
  model: ReplyModel;
  bird: ReplyBird;
  note: string;
  counter: Counter;
  sending: boolean;
  onNote: (note: string) => void;
  onSend: () => void;
};

export function ReplyView({
  backHref,
  model,
  bird,
  note,
  counter,
  sending,
  onNote,
  onSend,
}: ReplyViewProps) {
  const canSend = note.trim() !== "" && !counter.over && !sending;
  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <Link
          href={backHref}
          aria-label="Back to the note"
          className={styles.back}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5 L8 12 L15 19" />
          </svg>
        </Link>
        <h1 className={styles.title}>{model.title}</h1>
      </header>

      <section className={styles.trip}>
        <Bird {...bird} pose="perched" size={112} />
        <div className={styles.tripText}>
          <span className={styles.heading}>{model.heading}</span>
          <span className={styles.route}>{model.route}</span>
          <span className={styles.chips}>
            <span className={styles.free}>Free ride</span>
            <span className={styles.chip}>{model.speed}</span>
          </span>
        </div>
      </section>

      <section className={styles.theirs}>
        <span className={styles.wrote}>{model.wroteLabel}</span>
        <p className={styles.theirNote}>{model.note}</p>
      </section>

      <section className={styles.reply}>
        <label htmlFor="reply-note" className={styles.label}>
          Your reply
        </label>
        <div className={styles.paper}>
          <textarea
            id="reply-note"
            className={styles.field}
            value={note}
            aria-describedby="reply-count"
            onChange={(e) => onNote(e.target.value)}
          />
          <div className={styles.meta}>
            <span
              id="reply-count"
              aria-live="polite"
              className={counter.over ? styles.over : styles.count}
            >
              {counter.label}
            </span>
            <span>Same leg, same rules</span>
          </div>
        </div>
      </section>

      <p className={styles.wait}>
        <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7 V12 L15.5 14" />
        </svg>
        <span>{model.wait}</span>
      </p>

      <div className={styles.footer}>
        <button
          type="button"
          className={styles.release}
          disabled={!canSend}
          onClick={onSend}
        >
          {model.release}
        </button>
        <Link href={model.composeHref} className={styles.instead}>
          Send one of my own birds instead
        </Link>
      </div>
    </main>
  );
}
