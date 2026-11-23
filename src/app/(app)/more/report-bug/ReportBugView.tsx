import Link from "next/link";
import { BODY_MAX } from "@/lib/bugReportLimits";
import { COPY, ERRORS } from "./copy";
import styles from "./ReportBug.module.css";
import type { SendFailure } from "./submit";

const COUNT_FROM = 1800;
const TEXT_ID = "report-bug-text";

export type ReportBugStatus =
  | { kind: "editing"; error: SendFailure | null }
  | { kind: "sending" }
  | { kind: "sent" };

export type ReportBugViewProps = {
  text: string;
  route: string;
  status: ReportBugStatus;
  onText(text: string): void;
  onSend(): void;
};

export function ReportBugView({
  text,
  route,
  status,
  onText,
  onSend,
}: ReportBugViewProps) {
  const sending = status.kind === "sending";
  const error = status.kind === "editing" ? status.error : null;

  return (
    <div className={styles.screen}>
      <header className={styles.header}>
        <Link href="/more" aria-label={COPY.back} className={styles.back}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M15 5 L8 12 L15 19"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <h1 className={styles.heading}>{COPY.heading}</h1>
      </header>

      {status.kind === "sent" ? (
        <section className={styles.sent}>
          <h2 className={styles.sentHeading}>{COPY.sentHeading}</h2>
          <p className={styles.lead}>{COPY.sentThanks}</p>
          <Link href="/more" className={styles.button}>
            {COPY.back}
          </Link>
        </section>
      ) : (
        <>
          <p className={styles.lead}>{COPY.lead}</p>
          <div className={styles.field}>
            <label htmlFor={TEXT_ID} className={styles.label}>
              {COPY.label}
            </label>
            <textarea
              id={TEXT_ID}
              className={styles.text}
              value={text}
              maxLength={BODY_MAX}
              rows={5}
              placeholder={COPY.placeholder}
              onChange={(event) => onText(event.target.value)}
            />
            {text.length >= COUNT_FROM && (
              <p className={styles.count}>{COPY.count(text.length)}</p>
            )}
          </div>
          <p className={styles.small}>{COPY.include(route)}</p>
          <p className={styles.small}>{COPY.privacy}</p>
          <div className={styles.actions}>
            {error && (
              <p role="alert" className={styles.error}>
                {ERRORS[error]}
              </p>
            )}
            <button
              type="button"
              className={styles.button}
              disabled={sending || text.trim() === ""}
              onClick={onSend}
            >
              {sending ? COPY.sending : COPY.send}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
