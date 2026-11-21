import Link from "next/link";
import { Bird } from "@/components/Bird";
import { Loader } from "@/components/Loader";
import styles from "./Collection.module.css";
import type { BadgesView, BirdsView } from "./collection";

export type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; badges: BadgesView; birds: BirdsView };

function Header() {
  return (
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
      <h1 className={styles.title}>Collection</h1>
    </header>
  );
}

function Badges({ cards, count }: BadgesView) {
  return (
    <section className={styles.section} aria-labelledby="collection-badges">
      <div className={styles.head}>
        <h2 id="collection-badges" className={styles.heading}>
          Badges
        </h2>
        <div className={styles.count}>{count}</div>
      </div>
      <ul className={styles.grid}>
        {cards.map(({ id, name, line, icon, tint, earned }) => {
          const mask = `url(/assets/svg/icons/${icon}.svg)`;
          return (
            <li
              key={id}
              className={`${styles.card} ${earned ? styles.earned : styles.unearned}`}
            >
              <span className={`${styles.disc} ${styles[tint]}`}>
                <span
                  aria-hidden="true"
                  className={styles.icon}
                  style={{ maskImage: mask, WebkitMaskImage: mask }}
                />
              </span>
              <div className={styles.text}>
                <div className={styles.name}>{name}</div>
                <div className={styles.line}>{line}</div>
                {!earned && <span className="srOnly">Not earned yet</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Birds({ shown, more, count }: BirdsView) {
  return (
    <section className={styles.section} aria-labelledby="collection-birds">
      <div className={styles.head}>
        <h2 id="collection-birds" className={styles.heading}>
          Birds you have met
        </h2>
        <div className={styles.count}>{count}</div>
      </div>
      <div className={styles.met}>
        {shown.map(({ name, look, breed, gear, tone }, i) => (
          <span key={i} className={`${styles.avatar} ${styles[tone]}`}>
            <span className={styles.avatarBird}>
              <Bird
                look={look}
                breed={breed}
                gear={gear}
                pose="perched"
                animated={false}
                size={104}
                title={name}
              />
            </span>
          </span>
        ))}
        {more > 0 && (
          <div
            role="img"
            aria-label={`${more} more met`}
            className={styles.more}
          >
            +{more}
          </div>
        )}
      </div>
    </section>
  );
}

export function CollectionView({
  state,
  onRetry,
}: {
  state: State;
  onRetry: () => void;
}) {
  if (state.kind === "loading") return <Loader />;
  return (
    <div className={styles.page}>
      <Header />
      {state.kind === "ready" ? (
        <>
          <Badges {...state.badges} />
          <Birds {...state.birds} />
        </>
      ) : (
        <div className={styles.error}>
          <p role="alert" className={styles.message}>
            {state.message}
          </p>
          <button type="button" className={styles.retry} onClick={onRetry}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
