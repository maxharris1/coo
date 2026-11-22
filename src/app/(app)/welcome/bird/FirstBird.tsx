"use client";

import { useEffect, useReducer, useRef } from "react";
import type { Dispatch, PointerEvent } from "react";
import { useRouter } from "next/navigation";
import { pendingLink } from "@/app/(public)/b/[slug]/linkSignUp";
import { Bird } from "@/components/Bird";
import { HatchScene } from "@/components/HatchScene";
import {
  FIRST_BIRD,
  PRONOUNS,
  firstBird,
  initialFirstBird,
  onboardingBody,
  submitOnboarding,
  type FirstBirdAction,
  type FirstBirdState,
  type Pronoun,
} from "./choices";
import styles from "./page.module.css";

const SWIPE_PX = 40;

function Arrow({ d }: { d: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d={d}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PronounChips({
  name,
  value,
  onChange,
}: {
  name: string;
  value: Pronoun;
  onChange: (pronoun: Pronoun) => void;
}) {
  return (
    <fieldset className={styles.pronouns}>
      <legend className={styles.label}>Pronoun</legend>
      <div className={styles.chips}>
        {PRONOUNS.map((p) => (
          <label key={p.value} className={styles.chip}>
            <input
              type="radio"
              name={name}
              value={p.value}
              checked={value === p.value}
              onChange={() => onChange(p.value)}
            />
            {p.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

type PanelProps = {
  state: FirstBirdState;
  dispatch: Dispatch<FirstBirdAction>;
};

export function FirstBird() {
  const router = useRouter();
  const [state, dispatch] = useReducer(firstBird, undefined, initialFirstBird);
  useEffect(() => {
    const link = pendingLink();
    if (link) dispatch({ type: "yourName", name: link.name });
  }, []);
  const send = async () => {
    dispatch({ type: "send" });
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const result = await submitOnboarding(onboardingBody(state, timezone));
    if (result.ok) router.push("/welcome/loft");
    else dispatch({ type: "failed", message: result.message });
  };
  return <FirstBirdForm state={state} dispatch={dispatch} onSubmit={send} />;
}

export function FirstBirdForm({
  state,
  dispatch,
  onSubmit,
}: PanelProps & { onSubmit: () => void }) {
  const swipeFrom = useRef<number | null>(null);
  const { look, name: lookName } = FIRST_BIRD.looks[state.index];
  const count = FIRST_BIRD.looks.length;

  const onPointerDown = (e: PointerEvent) => {
    swipeFrom.current = e.clientX;
  };
  const onPointerUp = (e: PointerEvent) => {
    if (swipeFrom.current === null) return;
    const dx = e.clientX - swipeFrom.current;
    swipeFrom.current = null;
    if (Math.abs(dx) >= SWIPE_PX)
      dispatch({ type: "step", by: dx < 0 ? 1 : -1 });
  };

  return (
    <form
      className={styles.form}
      onSubmit={(e) => {
        e.preventDefault();
        if (!state.sending) onSubmit();
      }}
    >
      <div className={styles.field}>
        <label htmlFor="your-name" className={styles.label}>
          Your name
        </label>
        <input
          id="your-name"
          type="text"
          autoComplete="given-name"
          required
          className={styles.name}
          value={state.yourName}
          onChange={(e) => dispatch({ type: "yourName", name: e.target.value })}
        />
      </div>

      <div
        className={styles.carousel}
        role="group"
        aria-roledescription="carousel"
        aria-label="Pick a look"
      >
        <button
          type="button"
          className={styles.arrow}
          aria-label="Previous bird"
          onClick={() => dispatch({ type: "step", by: -1 })}
        >
          <Arrow d="M15 5 L8 12 L15 19" />
        </button>
        <div
          className={styles.stage}
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (swipeFrom.current = null)}
        >
          <HatchScene className={styles.scene} />
          <div key={look} className={styles.bird}>
            <Bird look={look} size={203} title={lookName} />
          </div>
        </div>
        <button
          type="button"
          className={styles.arrow}
          aria-label="Next bird"
          onClick={() => dispatch({ type: "step", by: 1 })}
        >
          <Arrow d="M9 5 L16 12 L9 19" />
        </button>
      </div>

      <div className={styles.about}>
        <p className={styles.caption} aria-live="polite">
          {`${FIRST_BIRD.breed}, ${state.index + 1} of ${count}`}
        </p>
        <ul className={styles.tags}>
          {FIRST_BIRD.tags.map((tag) => (
            <li key={tag} className={styles.pill}>
              {tag}
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.field}>
        <label htmlFor="bird-name" className={styles.label}>
          Name your pigeon
        </label>
        <div className={styles.nameRow}>
          <input
            id="bird-name"
            type="text"
            autoComplete="off"
            required
            className={styles.name}
            value={state.name}
            onChange={(e) => dispatch({ type: "rename", name: e.target.value })}
          />
          <button
            type="button"
            className={styles.shuffle}
            aria-label="Shuffle name"
            onClick={() => dispatch({ type: "shuffle", pick: Math.random() })}
          >
            Shuffle
          </button>
        </div>
      </div>

      <PronounChips
        name="pronoun"
        value={state.pronoun}
        onChange={(pronoun) => dispatch({ type: "pronoun", pronoun })}
      />

      {state.error !== null && (
        <div className={styles.toast} role="alert">
          <p>{state.error}</p>
          <button
            type="button"
            className={styles.toastClose}
            aria-label="Dismiss"
            onClick={() => dispatch({ type: "dismiss" })}
          >
            OK
          </button>
        </div>
      )}

      <div className={styles.footer}>
        <button type="submit" className={styles.adopt} disabled={state.sending}>
          {`Adopt ${state.name.trim() || lookName}`}
        </button>
        <p className={styles.note}>
          Next we ask for your city, never your address. Birds land at a
          neighborhood roost, not your front door.
        </p>
      </div>
    </form>
  );
}
