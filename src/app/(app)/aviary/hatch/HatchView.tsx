import Link from "next/link";
import type { Dispatch, FormEvent } from "react";
import { Bird, type Look } from "@/components/Bird";
import { HatchScene } from "@/components/HatchScene";
import { PronounChips } from "@/components/PronounChips";
import {
  breedCard,
  type HatchAction,
  type HatchState,
  type HatchedBird,
} from "./hatch";
import styles from "./Hatch.module.css";

const SHELL = {
  stroke: "var(--coo-ink)",
  strokeWidth: 2.5,
  strokeLinejoin: "round",
  fill: "var(--coo-card)",
} as const;

function Egg() {
  return (
    <svg viewBox="0 0 60 74" width="110" aria-hidden="true">
      <path
        d="M30 4 C44 4 54 30 54 46 a24 24 0 0 1 -48 0 C6 30 16 4 30 4 Z"
        {...SHELL}
      />
      <circle cx="22" cy="34" r="3" fill="var(--coo-lilac)" />
      <circle cx="38" cy="50" r="4" fill="var(--coo-lilac)" />
      <circle cx="36" cy="24" r="2.4" fill="var(--coo-lilac)" />
    </svg>
  );
}

function CrackedShell() {
  return (
    <svg viewBox="0 0 60 74" width="150" aria-hidden="true">
      <path
        className={styles.crackLeft}
        d="M30 4 C16 4 6 30 6 46 a24 24 0 0 0 24 24 V46 l-6 -5 l6 -6 Z"
        {...SHELL}
      />
      <path
        className={styles.crackRight}
        d="M30 4 C44 4 54 30 54 46 a24 24 0 0 1 -24 24 V46 l6 -5 l-6 -6 Z"
        {...SHELL}
      />
    </svg>
  );
}

function BackLink() {
  return (
    <Link
      href="/aviary"
      aria-label="Back to the aviary"
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
  );
}

function Hatched({ bird }: { bird: HatchedBird }) {
  const card = breedCard(bird.breed);
  return (
    <>
      <div className={styles.stage}>
        <HatchScene className={styles.scene} />
        <div className={styles.shell}>
          <CrackedShell />
        </div>
        <div className={styles.bird}>
          <Bird
            look={bird.look as Look}
            breed={bird.breed}
            size={180}
            title={bird.name}
          />
        </div>
      </div>
      <p className={styles.welcome}>{`Welcome home, ${bird.name}`}</p>
      <div className={styles.card}>
        <div className={styles.cardName}>{card.name}</div>
        <div className={styles.cardNote}>{card.note}</div>
        <div className={styles.trait}>{card.trait}</div>
      </div>
      <Link href="/aviary" className={styles.done}>
        Back to the aviary
      </Link>
    </>
  );
}

export function HatchView({
  state,
  dispatch,
  onSubmit,
}: {
  state: HatchState;
  dispatch: Dispatch<HatchAction>;
  onSubmit: () => void;
}) {
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <BackLink />
        <h1 className={styles.title}>Your egg is hatching</h1>
      </header>

      {state.kind === "hatched" ? (
        <Hatched bird={state.bird} />
      ) : (
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.stage}>
            <HatchScene className={styles.scene} />
            <div className={`${styles.shell} ${styles.wobble}`}>
              <Egg />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="hatch-name" className={styles.label}>
              Name your bird
            </label>
            <input
              id="hatch-name"
              type="text"
              autoComplete="off"
              required
              maxLength={24}
              className={styles.name}
              value={state.name}
              onChange={(e) => dispatch({ type: "name", name: e.target.value })}
            />
          </div>

          <PronounChips
            name="pronoun"
            value={state.pronoun}
            onChange={(pronoun) => dispatch({ type: "pronoun", pronoun })}
          />

          <button type="submit" className={styles.go} disabled={state.sending}>
            Welcome home
          </button>
        </form>
      )}
    </main>
  );
}
