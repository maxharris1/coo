import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./More.module.css";
import { MORE_ROWS, type MoreRow, type MoreSources } from "./more";

const ICONS: Record<MoreRow["id"], ReactNode> = {
  friends: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20 a6.5 6.5 0 0 1 13 0" />
      <path d="M15.5 4.8 a3.5 3.5 0 0 1 0 6.4 M18 14.5 a6.5 6.5 0 0 1 3.5 5.5" />
    </>
  ),
  shoebox: <path d="M3 8 H21 V20 H3 Z M2 4 H22 V8 H2 Z M9 12 H15" />,
  collection: (
    <>
      <rect
        x="4"
        y="4"
        width="16"
        height="16"
        rx="1.5"
        strokeDasharray="2.2 2.2"
      />
      <circle cx="12" cy="12" r="3.5" />
    </>
  ),
  aviary: (
    <path d="M12 3 C16 3 19 10 19 14 a7 7 0 0 1 -14 0 C5 10 8 3 12 3 Z" />
  ),
  earn: (
    <>
      <path d="M12 3 C17 7 19 12 12 21 C5 12 7 7 12 3 Z" />
      <path d="M12 8 V16" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5 L13.8 5.2 L17 4.4 L17.6 7.6 L20.8 8.6 L19.4 11.6 L21.5 14 L18.8 15.8 L19 19 L15.8 18.8 L14 21.5 L12 19 L10 21.5 L8.2 18.8 L5 19 L5.2 15.8 L2.5 14 L4.6 11.6 L3.2 8.6 L6.4 7.6 L7 4.4 L10.2 5.2 Z" />
    </>
  ),
};

export function MoreView({ sources }: { sources: MoreSources }) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <Link href="/" aria-label="Back to the loft" className={styles.back}>
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path
              d="M15 5 L8 12 L15 19"
              fill="none"
              stroke="var(--coo-ink)"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <h1 className={styles.heading}>Post office</h1>
      </header>
      <ul className={styles.grid}>
        {MORE_ROWS.map((row) => {
          const sub = row.sub(sources);
          return (
            <li key={row.id}>
              <Link href={row.href} className={styles.card}>
                <span className={`${styles.icon} ${styles[row.tone]}`}>
                  <svg
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    fill="none"
                    stroke="var(--coo-ink)"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    {ICONS[row.id]}
                  </svg>
                </span>
                <span className={styles.title}>{row.title}</span>
                {sub && <span className={styles.sub}>{sub}</span>}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
