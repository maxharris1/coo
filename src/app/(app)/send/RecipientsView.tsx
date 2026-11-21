import Link from "next/link";
import type { ReactNode } from "react";
import { Loader } from "@/components/Loader";
import { config } from "@/lib/config";
import {
  canGoNext,
  matches,
  nextHref,
  runningLine,
  type Card,
  type SillCard,
} from "./recipients";
import styles from "./Recipients.module.css";

export type RecipientList =
  { kind: "loading" } | { kind: "failed" } | { kind: "ready"; cards: Card[] };

export type Contacts = { supported: boolean; names: string[] };

export type RecipientsViewProps = {
  list: RecipientList;
  sill: SillCard[];
  contacts: Contacts;
  picked: ReadonlySet<string>;
  readyCount: number;
  query: string;
  onQuery: (query: string) => void;
  onToggle: (id: string) => void;
  onPickContacts: () => void;
  onOpenContact: (name: string) => void;
};

const TONES = [styles.sky, styles.mint, styles.lilac, styles.blush];
const SILL_TONES = [styles.blush, styles.sky, styles.mint, styles.lilac];
const CONTACT_TONES = [styles.peach, styles.sand];
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

function Check() {
  return (
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
  );
}

function RowBody({
  name,
  line,
  tone,
  pill,
}: {
  name: string;
  line: string;
  tone: string;
  pill?: string;
}) {
  return (
    <>
      <Check />
      <span aria-hidden="true" className={`${styles.avatar} ${tone}`}>
        {name.slice(0, 1).toUpperCase()}
      </span>
      <span className={styles.who}>
        <span className={styles.name}>{name}</span>
        <span className={styles.line}>{line}</span>
      </span>
      {pill && <span className={styles.pill}>{pill}</span>}
    </>
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
        <RowBody
          name={card.name}
          line={reachable ? card.line : card.reason}
          tone={tone}
        />
      </button>
    </li>
  );
}

function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.section} aria-labelledby={id}>
      <div className={styles.sectionHead}>
        <h2 id={id} className={styles.sectionTitle}>
          {title}
        </h2>
        {note && <span className={styles.sectionNote}>{note}</span>}
      </div>
      {children}
    </section>
  );
}

function Sill({ sill, query }: { sill: SillCard[]; query: string }) {
  const shown = sill
    .map((card, i) => ({ card, tone: SILL_TONES[i % SILL_TONES.length] }))
    .filter(({ card }) => matches(card.name, query));
  if (shown.length === 0) return null;
  return (
    <Section id="sill-title" title="A bird of theirs is on your sill">
      <ul className={styles.rows}>
        {shown.map(({ card, tone }) => (
          <li key={card.visitId}>
            <Link href={`/sill/${card.visitId}/reply`} className={styles.row}>
              <RowBody
                name={card.name}
                line={card.line}
                tone={tone}
                pill="Free ride"
              />
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

function FromContacts({
  contacts,
  query,
  onPickContacts,
  onOpenContact,
}: {
  contacts: Contacts;
  query: string;
  onPickContacts: () => void;
  onOpenContact: (name: string) => void;
}) {
  if (!contacts.supported) return null;
  if (contacts.names.length === 0) {
    return (
      <button
        type="button"
        className={styles.fromContacts}
        onClick={onPickContacts}
      >
        From your contacts
      </button>
    );
  }
  const shown = contacts.names
    .map((name, i) => ({
      name,
      key: `${i}:${name}`,
      tone: CONTACT_TONES[i % CONTACT_TONES.length],
    }))
    .filter(({ name }) => matches(name, query));
  if (shown.length === 0) return null;
  return (
    <Section
      id="contacts-title"
      title="From your contacts"
      note="Goes by text link"
    >
      <ul className={styles.rows}>
        {shown.map(({ name, key, tone }) => (
          <li key={key}>
            <Link
              href="/send/new"
              className={styles.row}
              onClick={() => onOpenContact(name)}
            >
              <RowBody
                name={name}
                line={`Not on ${config.app.name} yet. Add where the bird should fly.`}
                tone={tone}
                pill="By link"
              />
            </Link>
          </li>
        ))}
      </ul>
    </Section>
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
  const shown = cards
    .map((card, i) => ({ card, tone: TONES[i % TONES.length] }))
    .filter(({ card }) => matches(card.name, query));
  return (
    <Section
      id="friends-title"
      title="Friends"
      note="Flight time from your loft"
    >
      {shown.length === 0 ? (
        <p className={styles.empty}>
          {query
            ? "Nobody by that name. Send to someone new."
            : "No friends yet. Send to someone new."}
        </p>
      ) : (
        <ul className={styles.rows}>
          {shown.map(({ card, tone }) => (
            <Row
              key={card.id}
              card={card}
              tone={tone}
              picked={picked.has(card.id)}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </Section>
  );
}

export function RecipientsView({
  list,
  sill,
  contacts,
  picked,
  readyCount,
  query,
  onQuery,
  onToggle,
  onPickContacts,
  onOpenContact,
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

      <Sill sill={sill} query={query} />

      {list.kind === "loading" && <Loader />}
      {list.kind === "ready" && (
        <Friends
          cards={list.cards}
          picked={picked}
          query={query}
          onToggle={onToggle}
        />
      )}

      <FromContacts
        contacts={contacts}
        query={query}
        onPickContacts={onPickContacts}
        onOpenContact={onOpenContact}
      />

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
