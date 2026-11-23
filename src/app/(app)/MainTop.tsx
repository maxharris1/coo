import Link from "next/link";
import type { SyncPayload } from "@/components/sync";
import { greeting } from "@/lib/format";
import { LoftScene } from "./LoftScene";
import styles from "./MainTop.module.css";

const INK = "#2A2140";

function SeedIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3 C17 7 19 12 12 21 C5 12 7 7 12 3 Z"
        fill="#FFC93C"
        stroke={INK}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path d="M12 8 V16" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M4 7 H20 M4 12 H20 M4 17 H20"
        fill="none"
        stroke={INK}
        strokeWidth="2.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
      <g
        fill="none"
        stroke={INK}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 4 Q18 5 18 13 L20 17 H4 L6 13 Q6 5 12 4 Z" />
        <path d="M10 20 Q12 22 14 20" />
      </g>
    </svg>
  );
}

export function MainTop({ data, nowMs }: { data: SyncPayload; nowMs: number }) {
  const { seeds, timezone } = data.me;
  const { unread } = data;
  return (
    <section className={styles.top}>
      <header className={styles.header}>
        <p className={styles.wordmark}>coo</p>
        <div className={styles.actions}>
          <Link
            href="/notifications"
            className={styles.bell}
            aria-label={
              unread > 0 ? `Notifications, ${unread} unread` : "Notifications"
            }
          >
            <BellIcon />
            {unread > 0 && (
              <span className={styles.badge} aria-hidden="true">
                {unread}
              </span>
            )}
          </Link>
          <Link
            href="/more"
            className={styles.menu}
            aria-label="Open the post office menu"
          >
            <MenuIcon />
          </Link>
          <Link
            href="/shop"
            className={styles.seeds}
            aria-label={`Seed balance, ${seeds} ${seeds === 1 ? "seed" : "seeds"}. Open the seed store`}
          >
            <SeedIcon />
            <span>{seeds}</span>
          </Link>
        </div>
      </header>
      <h1 className={styles.greeting}>
        {greeting(nowMs, timezone, data.birds)}
      </h1>
      <LoftScene birds={data.birds} perches={data.me.perches} />
    </section>
  );
}
