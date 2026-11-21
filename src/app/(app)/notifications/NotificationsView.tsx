import Link from "next/link";
import emptyStates from "../../../../assets/copy/empty-states.json";
import { Loader } from "@/components/Loader";
import { clockTime } from "@/lib/format";
import type { NotificationItem } from "@/server/services/notifications";
import styles from "./Notifications.module.css";

export type ScreenState =
  | { kind: "loading" }
  | { kind: "ready"; items: NotificationItem[] }
  | { kind: "failed" };

export type NotificationsViewProps = { state: ScreenState; timezone: string };

const EMPTY_LINE = emptyStates.find(
  (s) => s.state === "No notifications",
)!.text;

const INK = "#2A2140";

const NOTE = "M4 7 H20 V18 H4 Z M4 7 L12 13 L20 7";
const ARROW = "M4 12 H18 M13 7 L18 12 L13 17";
const CLOCK = "M12 4 a8 8 0 1 0 0.01 0 Z M12 8 V12 L15 14";
const MOON = "M16 4 a8 8 0 1 0 4 12 a6.5 6.5 0 0 1 -4 -12 Z";
const SEED = "M12 3 C17 7 19 12 12 21 C5 12 7 7 12 3 Z M12 8 V16";
const EGG = "M12 3 C17 3 19 11 19 14 a7 7 0 0 1 -14 0 C5 11 7 3 12 3 Z";
const FRIEND =
  "M12 4 a4 4 0 1 0 0.01 0 Z M4 20 C5 15 8 13 12 13 C16 13 19 15 20 20";
const HOME = "M4 11 L12 4 L20 11 M6 10 V20 H18 V10";
const BELL =
  "M12 4 Q18 5 18 13 L20 17 H4 L6 13 Q6 5 12 4 Z M10 20 Q12 22 14 20";

const ICONS: Record<string, string> = {
  incoming: ARROW,
  "landed-in": NOTE,
  "landed-out": NOTE,
  "reply-home": NOTE,
  "reply-delivered": NOTE,
  "link-expired": NOTE,
  "home-empty": HOME,
  delayed: CLOCK,
  "delayed-in": CLOCK,
  roosting: MOON,
  hungry: SEED,
  tip: SEED,
  hatched: EGG,
  "friend-joined": FRIEND,
};

function KindIcon({ kind }: { kind: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <g
        fill="none"
        stroke={INK}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d={ICONS[kind] ?? BELL} />
      </g>
    </svg>
  );
}

function Row({ item, timezone }: { item: NotificationItem; timezone: string }) {
  return (
    <li>
      <Link
        href={item.url}
        className={item.read ? styles.row : `${styles.row} ${styles.unread}`}
      >
        <span className={styles.icon}>
          <KindIcon kind={item.kind} />
        </span>
        <span className={styles.rowText}>
          <span className={styles.rowTitle}>{item.title}</span>
          <span className={styles.rowBody}>{item.body}</span>
        </span>
        <time className={styles.time}>
          {clockTime(new Date(item.createdAt), timezone)}
        </time>
      </Link>
    </li>
  );
}

export function NotificationsView({ state, timezone }: NotificationsViewProps) {
  if (state.kind === "loading") return <Loader />;
  return (
    <section className={styles.screen}>
      <h1 className={styles.title}>Notifications</h1>
      {state.kind === "ready" && state.items.length === 0 && (
        <p className={styles.empty}>{EMPTY_LINE}</p>
      )}
      {state.kind === "ready" && state.items.length > 0 && (
        <ul className={styles.rows}>
          {state.items.map((item) => (
            <Row key={item.id} item={item} timezone={timezone} />
          ))}
        </ul>
      )}
    </section>
  );
}
