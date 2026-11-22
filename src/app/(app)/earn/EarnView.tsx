import Link from "next/link";
import { Loader } from "@/components/Loader";
import { SeedIcon, SUN } from "../shop/ShopTop";
import type { EarnState, EarnTop } from "./earn";
import { JobsPanel } from "./JobsPanel";
import styles from "./Earn.module.css";

function PunchCard({ top }: { top: EarnTop }) {
  const punched = top.stamps.filter((s) => s === "punched").length;
  return (
    <section aria-label="Post office punch card" className={styles.card}>
      <div className={styles.cardHead}>
        <span>POST OFFICE PUNCH CARD</span>
        <span>{top.week}</span>
      </div>
      <div
        role="img"
        aria-label={`${punched} of ${top.stamps.length} deliveries punched`}
        className={styles.stamps}
      >
        {top.stamps.map((s, i) => (
          <div key={i} className={`${styles.stamp} ${styles[s]}`}></div>
        ))}
      </div>
      <div className={styles.line}>{top.line}</div>
    </section>
  );
}

export function EarnView({
  state,
  onRetry,
  onChanged,
}: {
  state: EarnState;
  onRetry: () => void;
  onChanged: () => Promise<void>;
}) {
  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <Link
          href="/shop"
          aria-label="Back to the seed store"
          className={styles.back}
        >
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
        <h1 className={styles.title}>Earn seeds</h1>
        {state.kind === "ready" && (
          <div
            aria-label={`You have ${state.top.seeds} ${state.top.seeds === 1 ? "seed" : "seeds"}`}
            className={styles.balance}
          >
            <SeedIcon size={22} fill={SUN} />
            <span>{state.top.seeds}</span>
          </div>
        )}
      </header>

      {state.kind === "loading" && <Loader />}
      {state.kind === "failed" && (
        <div className={styles.failed}>
          <p className={styles.failedLine}>{state.message}</p>
          <button type="button" className={styles.retry} onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
      {state.kind === "ready" && (
        <>
          <PunchCard top={state.top} />
          <section aria-labelledby="earn-pay" className={styles.pay}>
            <h2 id="earn-pay" className={styles.payTitle}>
              Every delivery pays
            </h2>
            <dl className={styles.payTable}>
              {state.top.pay.map((row) => (
                <div key={row.label} className={styles.payRow}>
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>
          <JobsPanel
            jobs={state.jobs}
            found={state.found}
            onChanged={onChanged}
          />
        </>
      )}
    </main>
  );
}
