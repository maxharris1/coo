"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "../../auth.module.css";
import { joinFriend } from "./joinFriend";

export function AddFriend({ code, label }: { code: string; label: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const add = async () => {
    setError(null);
    setSending(true);
    const result = await joinFriend(code);
    if (result.ok) {
      router.push("/friends");
      return;
    }
    setSending(false);
    setError(result.message);
  };

  return (
    <>
      {error && (
        <p role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <button
        type="button"
        className={styles.primary}
        disabled={sending}
        onClick={add}
      >
        {label}
      </button>
    </>
  );
}
