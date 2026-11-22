import Link from "next/link";
import type { Dispatch, FormEvent } from "react";
import { Bird } from "@/components/Bird";
import { HatchScene } from "@/components/HatchScene";
import { PronounChips } from "@/components/PronounChips";
import { lookName, type RoommateAction, type RoommateState } from "./roommate";
import styles from "./Roommate.module.css";

function BackLink() {
  return (
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
  );
}

export function RoommateView({
  state,
  dispatch,
  onSubmit,
}: {
  state: RoommateState;
  dispatch: Dispatch<RoommateAction>;
  onSubmit: () => void;
}) {
  if (state.kind === "none") {
    return (
      <main className={styles.screen}>
        <header className={styles.header}>
          <BackLink />
          <h1 className={styles.title}>No roommate waiting</h1>
        </header>
        <p className={styles.line}>Nobody new is moving in right now.</p>
        <Link href="/" className={styles.done}>
          Back to the loft
        </Link>
      </main>
    );
  }

  const defaultName = lookName(state.look);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <main className={styles.screen}>
      <header className={styles.header}>
        <BackLink />
        <h1 className={styles.title}>{`${state.first} has a roommate`}</h1>
      </header>

      <form className={styles.form} onSubmit={submit}>
        <div className={styles.stage}>
          <HatchScene className={styles.scene} />
          <div className={styles.bird}>
            <Bird look={state.look} size={203} title={defaultName} />
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor="roommate-name" className={styles.label}>
            Name the roommate
          </label>
          <input
            id="roommate-name"
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
          {`Adopt ${state.name.trim() || defaultName}`}
        </button>
      </form>
    </main>
  );
}
