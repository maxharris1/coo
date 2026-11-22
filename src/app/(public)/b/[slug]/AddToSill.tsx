"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { claimLink } from "./claimLink";
import styles from "./GuestClaim.module.css";

export function AddToSill({ token, offer }: { token: string; offer: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const add = async () => {
    setError(null);
    setSending(true);
    const result = await claimLink(token);
    if (result.ok) {
      router.push(result.next);
      return;
    }
    setSending(false);
    setError(result.message);
  };

  return (
    <div className={styles.claim}>
      <div className={styles.claimHead}>
        <h2 className={styles.offer}>{offer}</h2>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className={styles.cta}
        disabled={sending}
        onClick={add}
      >
        Add to my sill
      </button>
    </div>
  );
}
