"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { isCurrentTab } from "./shell";
import { useSync } from "./SyncProvider";
import styles from "./TabBar.module.css";

const icon = (path: ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true">
    {path}
  </svg>
);
const stroke = {
  fill: "none",
  stroke: "var(--coo-ink)",
  strokeWidth: 2.2,
  strokeLinejoin: "round",
} as const;

const TABS = [
  {
    href: "/",
    label: "Loft",
    icon: icon(
      <>
        <path d="M4 11 L12 4 L20 11 V20 H4 Z" {...stroke} />
        <circle cx="12" cy="14" r="2.4" fill="var(--coo-ink)" />
      </>,
    ),
  },
  {
    href: "/flights",
    label: "Flights",
    icon: icon(
      <path
        d="M3 6 L9 4 L15 6 L21 4 V18 L15 20 L9 18 L3 20 Z M9 4 V18 M15 6 V20"
        {...stroke}
      />,
    ),
  },
  { href: "/send", label: "Send a pigeon", icon: null },
  {
    href: "/sill",
    label: "Sill",
    icon: icon(
      <>
        <rect x="3" y="6" width="18" height="13" rx="2.5" {...stroke} />
        <path d="M3.5 7.5 L12 13.5 L20.5 7.5" {...stroke} />
      </>,
    ),
  },
  {
    href: "/shop",
    label: "Seeds",
    icon: icon(
      <path
        d="M6 9 H18 L19.5 20 H4.5 Z M9 9 V7 a3 3 0 0 1 6 0 V9"
        {...stroke}
      />,
    ),
  },
] as const;

export function TabBar() {
  const path = usePathname();
  const { data } = useSync();
  const birdWaiting = (data?.visits.length ?? 0) > 0;

  return (
    <nav aria-label="Main" className={styles.bar}>
      <div className={styles.band}>
        {TABS.map((tab) =>
          tab.icon === null ? (
            <Link
              key={tab.href}
              href={tab.href}
              aria-label={tab.label}
              className={styles.send}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  d="M3 14 C7 6 13 4 21 5 C20 9 17 12 13 13 C15 14 16 15 18 15 C14 19 7 19 3 14 Z"
                  fill="var(--coo-card)"
                  stroke="var(--coo-ink)"
                  strokeWidth="2"
                  strokeLinejoin="round"
                />
                <path
                  d="M3 14 C8 12 12 10 16 8"
                  fill="none"
                  stroke="var(--coo-ink)"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </Link>
          ) : (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isCurrentTab(tab.href, path) ? "page" : undefined}
              className={styles.tab}
            >
              <span className={styles.icon}>
                {tab.icon}
                {tab.href === "/sill" && birdWaiting && (
                  <span className={styles.dot} />
                )}
              </span>
              <span>{tab.label}</span>
              {tab.href === "/sill" && birdWaiting && (
                <span className="srOnly">, a bird is waiting</span>
              )}
            </Link>
          ),
        )}
      </div>
    </nav>
  );
}
