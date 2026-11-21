import Link from "next/link";
import type { ReactNode } from "react";
import { Loader } from "@/components/Loader";
import { canGoNext, nextHref, runningLine, type Card } from "./recipients";
import styles from "./Recipients.module.css";

export type RecipientList =
  { kind: "loading" } | { kind: "failed" } | { kind: "ready"; cards: Card[] };

export type RecipientsViewProps = {
  list: RecipientList;
  picked: ReadonlySet<string>;
  readyCount: number;
  query: string;
  onQuery: (query: string) => void;
  onToggle: (id: string) => void;
};

const TONES = [styles.sky, styles.mint, styles.lilac, styles.blush];
const INK = "#2A2140";

function Icon({ width, children }: { width: string; children: ReactNode }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <g
        fill="none"
        stroke={INK}
        strokeWidth={width}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </g>
    </svg>
  );
}

function Row({
  card,
  tone,
  picked,
  onToggle,
}: {
  card: Card;
  tone: string;
  picked: boolean;
  onToggle: (id: string) => void;
}) {
  const reachable = card.kind === "friend";
  return (
    <li>
      <button
        type="button"
        className={styles.row}
        disabled={!reachable}
        aria-pressed={reachable ? picked : undefined}
        onClick={() => onToggle(card.id)}
      >
        <span className={styles.check}>
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M5 12.5 L10 17.5 L19 7"
              fill="none"
              stroke="#FFFBF0"
              strokeWidth="3.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <span aria-hidden="true" className={`${styles.avatar} ${tone}`}>
          {card.name.slice(0, 1).toUpperCase()}
        </span>
        <span className={styles.who}>
          <span className={styles.name}>{card.name}</span>
          <span className={styles.line}>
            {reachable ? card.line : card.reason}
          </span>
        </span>
      </button>
    </li>
  );
}

function Friends({
  cards,
  picked,
  query,
  onToggle,
}: {
  cards: Card[];
  picked: ReadonlySet<string>;
  query: string;
  onToggle: (id: string) => void;
}) {
  return (
    <section className={styles.section} aria-labelledby="friends-title">
      <div className={styles.sectionHead}>
        <h2 id="friends-title" className={styles.sectionTitle}>
          Friends
        </h2>
        <span className={styles.sectionNote}>Flight time from your loft</span>
      </div>
      {cards.length === 0 ? (
        <p className={styles.empty}>
          {query
            ? "Nobody by that name. Send to someone new."
            : "No friends yet. Send to someone new."}
        </p>
      ) : (
        <ul className={styles.rows}>
          {cards.map((card, i) => (
            <Row
              key={card.id}
              card={card}
              tone={TONES[i % TONES.length]}
              picked={picked.has(card.id)}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export function RecipientsView({
  list,
  picked,
  readyCount,
  query,
  onQuery,
  onToggle,
}: RecipientsViewProps) {
  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <Link href="/" aria-label="Back to the loft" className={styles.back}>
          <Icon width="2.8">
            <path d="M15 5 L8 12 L15 19" />
          </Icon>
        </Link>
        <h1 className={styles.title}>Who&apos;s it for?</h1>
      </header>

      <label className={styles.search}>
        <Icon width="2.2">
          <circle cx="10.5" cy="10.5" r="6" />
          <path d="M15 15 L20 20" />
        </Icon>
        <input
          type="text"
          autoComplete="off"
          aria-label="Search friends and contacts"
          placeholder="Search friends and contacts"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          className={styles.searchInput}
        />
      </label>

      {list.kind === "loading" && <Loader />}
      {list.kind === "ready" && (
        <Friends
          cards={list.cards}
          picked={picked}
          query={query}
          onToggle={onToggle}
        />
      )}

      <Link href="/send/new" className={styles.someoneNew}>
        <Icon width="2.8">
          <path d="M12 5 V19 M5 12 H19" />
        </Icon>
        <span>Someone new</span>
      </Link>

      <div className={styles.bar}>
        <p className={styles.running} aria-live="polite">
          {runningLine(picked.size, readyCount)}
        </p>
        {canGoNext(picked.size, readyCount) ? (
          <Link href={nextHref([...picked])} className={styles.next}>
            Next
          </Link>
        ) : (
          <button
            type="button"
            disabled
            aria-disabled="true"
            className={styles.next}
          >
            Next
          </button>
        )}
      </div>
    </main>
  );
}
