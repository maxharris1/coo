import Link from "next/link";
import { Bird } from "@/components/Bird";
import { Loader } from "@/components/Loader";
import styles from "./Collection.module.css";
import type {
  BadgesView,
  BirdsView,
  PostmarkSlot,
  PostmarksView,
} from "./collection";

export type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | {
      kind: "ready";
      postmarks: PostmarksView;
      badges: BadgesView;
      birds: BirdsView;
    };

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

function Stamp({
  date,
  place,
  long,
  label,
}: Extract<PostmarkSlot, { kind: "stamp" }>) {
  return (
    <svg
      className={styles.stamp}
      viewBox="0 0 84 84"
      role="img"
      aria-label={label}
    >
      <circle className={styles.ring} cx="42" cy="42" r="38" />
      <circle
        className={styles.dash}
        cx="42"
        cy="42"
        r="31"
        strokeDasharray="3 3"
      />
      <text className={styles.small} x="42" y="30">
        PIGEON POST
      </text>
      <text className={styles.date} x="42" y="49">
        {date}
      </text>
      <text className={long ? styles.long : styles.small} x="42" y="62">
        {place}
      </text>
    </svg>
  );
}

function Postmarks({ slots, count }: PostmarksView) {
  return (
    <section className={styles.section} aria-labelledby="collection-postmarks">
      <div className={styles.head}>
        <h2 id="collection-postmarks" className={styles.heading}>
          Postmarks
        </h2>
        <div className={styles.count}>{count}</div>
      </div>
      <ul className={styles.stamps}>
        {slots.map((slot) =>
          slot.kind === "stamp" ? (
            <li
              key={slot.key}
              className={`${styles.slot} ${slot.fresh ? styles.fresh : ""}`}
            >
              <Stamp {...slot} />
            </li>
          ) : (
            <li key={slot.key} className={styles.slot}>
              <span
                role="img"
                aria-label="Not collected yet"
                className={styles.empty}
              >
                ?
              </span>
            </li>
          ),
        )}
      </ul>
    </section>
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
          <Postmarks {...state.postmarks} />
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
