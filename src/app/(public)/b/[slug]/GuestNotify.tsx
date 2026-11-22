"use client";

import { useId, useState } from "react";
import styles from "./Guest.module.css";

type State =
  | { step: "closed" }
  | { step: "open"; error?: string }
  | { step: "sending" }
  | { step: "done" };

export function GuestNotify({
  token,
  button,
  consent,
  birdName,
}: {
  token: string;
  button: string;
  consent: string;
  birdName: string;
}) {
  const [state, setState] = useState<State>({ step: "closed" });
  const [phone, setPhone] = useState("");
  const [agreed, setAgreed] = useState(false);
  const phoneId = useId();

  if (state.step === "closed") {
    return (
      <button
        type="button"
        className={styles.cta}
        onClick={() => setState({ step: "open" })}
      >
        {button}
      </button>
    );
  }

  if (state.step === "done") {
    return (
      <p className={styles.done} role="status">
        We will text you once when {birdName} lands. Then we forget the number.
      </p>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed) return;
    setState({ step: "sending" });
    const res = await fetch(`/api/guest/${encodeURIComponent(token)}/notify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone, consent: true }),
    }).catch(() => null);
    if (res?.ok) return setState({ step: "done" });
    const body = await res?.json().catch(() => null);
    setState({
      step: "open",
      error: body?.error?.message ?? "That did not go through. Try again.",
    });
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      <label className={styles.field} htmlFor={phoneId}>
        <span>Your phone number</span>
        <input
          id={phoneId}
          className={styles.input}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          required
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
        />
      </label>
      <label className={styles.consent}>
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
        />
        <span>{consent}</span>
      </label>
      {state.step === "open" && state.error && (
        <p className={styles.error} role="alert">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        className={styles.cta}
        disabled={!agreed || state.step === "sending"}
      >
        {state.step === "sending" ? "Saving…" : "Text me"}
      </button>
    </form>
  );
}
