import Link from "next/link";
import { Loader } from "@/components/Loader";
import { config } from "@/lib/config";
import type { Units } from "@/lib/format";
import type { FriendRow, Shows } from "@/server/services/friends";
import { friendLine, type FriendsList } from "./friendsApi";
import { FriendSheet, type SheetState, type SheetStep } from "./FriendSheet";
import { GuestLinksWaiting } from "./GuestLinksWaiting";
import styles from "./Friends.module.css";

export type ListState =
  { kind: "loading" } | { kind: "failed" } | ({ kind: "ready" } & FriendsList);

export type FriendsViewProps = {
  inviteLink: string;
  units: Units;
  list: ListState;
  onCopy: () => void;
  sheet: SheetState | null;
  onOpen: (friend: FriendRow) => void;
  onStep: (step: SheetStep) => void;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  onShows: (id: string, shows: Shows) => void;
};

const TONES = [styles.blush, styles.sky, styles.mint, styles.lilac];
const SHOWS: Shows[] = ["city", "block"];
const LABELS: Record<Shows, string> = { city: "City", block: "Block" };

const INK = "#2A2140";

function Icon({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <g
        fill="none"
        stroke={INK}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={d} />
      </g>
    </svg>
  );
}

const COPY_ICON =
  "M10.5 8 H17.5 a2.5 2.5 0 0 1 2.5 2.5 v7 a2.5 2.5 0 0 1 -2.5 2.5 h-7 a2.5 2.5 0 0 1 -2.5 -2.5 v-7 a2.5 2.5 0 0 1 2.5 -2.5 Z M16 8 V6 a2 2 0 0 0 -2 -2 H6 a2 2 0 0 0 -2 2 v8 a2 2 0 0 0 2 2 h2";
const TEXT_ICON = "M4 5 H20 V16 H11 L6 20 V16 H4 Z";

function FriendItem({
  friend,
  tone,
  units,
  onOpen,
  onShows,
}: {
  friend: FriendRow;
  tone: string;
  units: Units;
  onOpen: (friend: FriendRow) => void;
  onShows: (id: string, shows: Shows) => void;
}) {
  return (
    <li className={styles.row}>
      <button
        type="button"
        aria-haspopup="dialog"
        className={styles.opener}
        onClick={() => onOpen(friend)}
      >
        <span aria-hidden="true" className={`${styles.avatar} ${tone}`}>
          {friend.name.slice(0, 1).toUpperCase()}
        </span>
        <span className={styles.who}>
          <span className={styles.name}>{friend.name}</span>
          <span className={styles.line}>{friendLine(friend, units)}</span>
        </span>
      </button>
      <div
        role="radiogroup"
        aria-label={`What ${friend.name} can see`}
        className={styles.toggle}
      >
        {SHOWS.map((shows) => (
          <button
            key={shows}
            type="button"
            role="radio"
            aria-checked={shows === friend.shows}
            className={
              shows === friend.shows
                ? `${styles.choice} ${styles.on}`
                : styles.choice
            }
            onClick={() => onShows(friend.id, shows)}
          >
            {LABELS[shows]}
          </button>
        ))}
      </div>
    </li>
  );
}

export function FriendsView({
  inviteLink,
  units,
  list,
  onCopy,
  sheet,
  onOpen,
  onStep,
  onClose,
  onConfirm,
  onShows,
}: FriendsViewProps) {
  const sms = `sms:?&body=${encodeURIComponent(
    `Trade pigeons with me on ${config.app.name}: ${inviteLink}`,
  )}`;

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <Link
          href="/more"
          aria-label="Back to the post office"
          className={styles.back}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M15 5 L8 12 L15 19"
              fill="none"
              stroke={INK}
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <h1 className={styles.title}>Friends</h1>
      </header>

      <section className={styles.invite} aria-labelledby="invite-title">
        <div>
          <h2 id="invite-title" className={styles.inviteTitle}>
            Your invite link
          </h2>
          <p className={styles.inviteUrl}>
            {inviteLink.replace(/^https?:\/\//, "")}
          </p>
        </div>
        <div className={styles.inviteActions}>
          <button type="button" className={styles.action} onClick={onCopy}>
            <Icon d={COPY_ICON} />
            <span>Copy</span>
          </button>
          <a href={sms} className={styles.action}>
            <Icon d={TEXT_ICON} />
            <span>Text it</span>
          </a>
        </div>
      </section>

      <p className={styles.explain}>
        City shows a friend your city. Block shows the roost nearest you, so
        short flights can be drawn street by street. Nobody sees an address.
      </p>

      {list.kind === "loading" && <Loader />}
      {list.kind === "ready" && (
        <>
          <section className={styles.list} aria-labelledby="friends-count">
            <div className={styles.listHead}>
              <h2 id="friends-count" className={styles.count}>
                {list.friends.length}{" "}
                {list.friends.length === 1 ? "friend" : "friends"}
              </h2>
              <span className={styles.seeLabel}>They can see</span>
            </div>
            <ul className={styles.rows}>
              {list.friends.map((f, i) => (
                <FriendItem
                  key={f.id}
                  friend={f}
                  tone={TONES[i % TONES.length]}
                  units={units}
                  onOpen={onOpen}
                  onShows={onShows}
                />
              ))}
            </ul>
          </section>
          <GuestLinksWaiting links={list.guestLinks} />
        </>
      )}
      {sheet && (
        <FriendSheet
          {...sheet}
          onStep={onStep}
          onClose={onClose}
          onConfirm={onConfirm}
        />
      )}
    </main>
  );
}
