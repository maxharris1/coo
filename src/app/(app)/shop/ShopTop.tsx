import Link from "next/link";
import styles from "./ShopTop.module.css";

export const INK = "#2A2140";
export const SUN = "#FFC93C";

export function SeedIcon({ size, fill }: { size: number; fill: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 3 C17 7 19 12 12 21 C5 12 7 7 12 3 Z"
        fill={fill}
        stroke={INK}
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path d="M12 8 V16" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function ShopTop({ seeds }: { seeds: number }) {
  return (
    <>
      <div aria-hidden="true" className={styles.awning}></div>
      <header className={styles.header}>
        <h1 className={styles.title}>Seed store</h1>
        <div
          aria-label={`You have ${seeds} ${seeds === 1 ? "seed" : "seeds"}`}
          className={styles.balance}
        >
          <SeedIcon size={22} fill={SUN} />
          <span>{seeds}</span>
        </div>
      </header>
      <div className={styles.earn}>
        <p className={styles.line}>You earn seeds every time a note lands.</p>
        <Link href="/earn" className={styles.more}>
          More ways
        </Link>
      </div>
    </>
  );
}
