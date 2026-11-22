"use client";

import { useState } from "react";
import styles from "./Guest.module.css";

const REASONS = [
  "I don't know who sent this",
  "It's spam",
  "It's harassment",
  "Something else",
] as const;

type State =
  | { step: "closed" }
  | { step: "open"; error?: string }
  | { step: "sending" }
  | { step: "done" };

export function GuestReport({ token }: { token: string }) {
  const [state, setState] = useState<State>({ step: "closed" });
  const [reason, setReason] = useState<string>(REASONS[0]);

  if (state.step === "closed") {
    return (
      <button
        type="button"
        className={styles.link}
        onClick={() => setState({ step: "open" })}
      >
        Report this link
      </button>
    );
  }

  if (state.step === "done") {
    return (
      <p className={styles.done} role="status">
        Thanks. This link is closed and we will look at it.
      </p>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState({ step: "sending" });
    const res = await fetch(`/api/guest/${encodeURIComponent(token)}/report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    }).catch(() => null);
    if (res?.ok) return setState({ step: "done" });
    setState({ step: "open", error: "That did not go through. Try again." });
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <fieldset className={styles.reasons}>
        <legend>Why are you reporting this?</legend>
        {REASONS.map((r) => (
          <label key={r} className={styles.consent}>
            <input
              type="radio"
              name="reason"
              value={r}
              checked={reason === r}
              onChange={() => setReason(r)}
            />
            <span>{r}</span>
          </label>
        ))}
      </fieldset>
      {state.step === "open" && state.error && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}
      <div className={styles.row}>
        <button
          type="button"
          className={styles.link}
          onClick={() => setState({ step: "closed" })}
        >
          Cancel
        </button>
        <button
          type="submit"
          className={styles.secondary}
          disabled={state.step === "sending"}
        >
          Report
        </button>
      </div>
    </form>
  );
}
