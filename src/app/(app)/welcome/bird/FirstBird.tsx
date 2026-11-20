"use client";

import { useReducer, useRef } from "react";
import type { PointerEvent } from "react";
import { Bird } from "@/components/Bird";
import { FIRST_BIRD, PRONOUNS, firstBird, initialFirstBird } from "./choices";
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

function Scene() {
  return (
    <svg viewBox="0 0 250 250" className={styles.scene} aria-hidden="true">
      <circle
        cx="125"
        cy="125"
        r="120"
        fill="var(--coo-sky)"
        stroke="var(--coo-ink)"
        strokeWidth="3"
      />
      <path
        d="M150 62 q-6 -2 -5 -8 q0 -8 10 -8 q5 -7 15 -4 q10 -3 12 6 q10 0 10 8 q0 6 -8 6 z"
        fill="var(--coo-card)"
        stroke="var(--coo-ink)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M22 196 Q125 176 228 196 Q200 238 125 244 Q50 238 22 196 Z"
        fill="var(--coo-mint)"
        stroke="var(--coo-ink)"
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <g
        stroke="var(--coo-ink)"
        strokeWidth="2.5"
        strokeLinejoin="round"
        fill="var(--coo-card)"
      >
        <path
          d="M34 196 l7 -9 l7 9 l7 -9 l7 9 l7 -9 l7 9 q-3 20 -21 20 q-18 0 -21 -20 z"
          transform="rotate(-14 55 205)"
        />
        <path
          d="M176 200 l7 -9 l7 9 l7 -9 l7 9 l7 -9 l7 9 q-3 20 -21 20 q-18 0 -21 -20 z"
          transform="rotate(16 197 209)"
        />
      </g>
    </svg>
  );
}

export function FirstBird() {
  const [state, dispatch] = useReducer(firstBird, undefined, initialFirstBird);
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
    <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
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
          <Scene />
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

      <fieldset className={styles.pronouns}>
        <legend className={styles.label}>Pronoun</legend>
        <div className={styles.chips}>
          {PRONOUNS.map(({ value, label }) => (
            <label key={value} className={styles.chip}>
              <input
                type="radio"
                name="pronoun"
                value={value}
                checked={state.pronoun === value}
                onChange={() => dispatch({ type: "pronoun", pronoun: value })}
              />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className={styles.footer}>
        <button type="submit" className={styles.adopt}>
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
