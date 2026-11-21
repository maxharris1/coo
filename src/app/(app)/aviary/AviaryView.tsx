import Link from "next/link";
import { Bird } from "@/components/Bird";
import { Loader } from "@/components/Loader";
import type { AviaryState, BreedCard, EggCard } from "./aviary";
import styles from "./Aviary.module.css";

function EggArt() {
  return (
    <svg
      width="62"
      viewBox="0 0 60 74"
      aria-hidden="true"
      className={styles.eggArt}
    >
      <path
        d="M30 4 C44 4 54 30 54 46 a24 24 0 0 1 -48 0 C6 30 16 4 30 4 Z"
        fill="var(--coo-card)"
        stroke="var(--coo-ink)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <circle cx="22" cy="34" r="3" fill="var(--coo-lilac)" />
      <circle cx="38" cy="50" r="4" fill="var(--coo-lilac)" />
      <circle cx="36" cy="24" r="2.4" fill="var(--coo-lilac)" />
      <path
        d="M16 44 l6 5 l6 -6 l6 6 l6 -5"
        fill="none"
        stroke="var(--coo-ink)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function EggBody({ egg }: { egg: EggCard }) {
  switch (egg.kind) {
    case "incubating": {
      const { toGo, done, span } = egg;
      return (
        <>
          <div className={styles.eggTitle}>An egg is on the way</div>
          <div className={styles.eggLine}>
            {`It hatches after ${toGo} more ${toGo === 1 ? "delivery" : "deliveries"}. The breed is a surprise.`}
          </div>
          <div
            role="img"
            aria-label={`${done} of ${span} deliveries`}
            className={styles.bar}
          >
            <div
              className={styles.fill}
              style={{ width: `${Math.round((done / span) * 100)}%` }}
            />
          </div>
        </>
      );
    }
    case "ready":
      return (
        <>
          <div className={styles.eggTitle}>Your egg is ready</div>
          <div className={styles.eggLine}>
            It is wobbling. The breed is a surprise.
          </div>
          <Link href="/aviary/hatch" className={styles.hatch}>
            Hatch
          </Link>
        </>
      );
    case "waiting":
      return (
        <>
          <div className={styles.eggTitle}>Your egg is ready</div>
          <div className={styles.eggLine}>No free perch. The egg can wait.</div>
          <Link href="/shop" className={styles.shop}>
            Visit the seed store
          </Link>
        </>
      );
  }
}

function Breeds({ breeds }: { breeds: BreedCard[] }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Who might hatch</h2>
        <div className={styles.count}>{`${breeds.length} breeds`}</div>
      </div>
      <ul className={styles.breeds}>
        {breeds.map((b) => (
          <li key={b.id} className={styles.breed}>
            <div
              className={styles.breedArt}
              style={
                b.id === "tumbler" ? { transform: "rotate(180deg)" } : undefined
              }
            >
              <Bird look={b.id} size={112} title={`${b.name} pigeon`} />
            </div>
            <div className={styles.breedName}>{b.name}</div>
            <div className={styles.breedNote}>{b.note}</div>
            <div className={styles.trait}>{b.trait}</div>
            {b.owned && <div className={styles.owned}>In the loft</div>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function AviaryView({
  state,
  onRetry,
}: {
  state: AviaryState;
  onRetry: () => void;
}) {
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
              stroke="var(--coo-ink)"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </Link>
        <h1 className={styles.title}>Aviary</h1>
        {state.kind === "ready" && (
          <div className={styles.pill}>{state.top.perches}</div>
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
      {state.kind === "ready" && state.top.egg && (
        <div className={styles.egg}>
          <EggArt />
          <div className={styles.eggText}>
            <EggBody egg={state.top.egg} />
          </div>
        </div>
      )}
      {state.kind === "ready" && state.top.breeds.length > 0 && (
        <Breeds breeds={state.top.breeds} />
      )}
    </main>
  );
}
