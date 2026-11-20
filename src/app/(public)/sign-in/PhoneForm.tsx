"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { NOT_A_PHONE, toE164 } from "@/lib/phone";
import styles from "../auth.module.css";
import { useSignInPhone } from "./phone";
import { postAuth } from "./postAuth";

export function PhoneForm() {
  const router = useRouter();
  const { setPhone } = useSignInPhone();
  const [country, setCountry] = useState("+1");
  const [number, setNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const phone = toE164(number, country.replace(/\D/g, "") || "1");
    if (!phone) {
      setError(NOT_A_PHONE);
      return;
    }
    setError(null);
    setSending(true);
    const result = await postAuth("/api/auth/code", { phone });
    if (result.ok) {
      setPhone(phone);
      router.push(result.next);
      return;
    }
    setSending(false);
    setError(result.message);
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.phoneRow}>
        <label htmlFor="sign-in-country" className={styles.srOnly}>
          Country code
        </label>
        <input
          id="sign-in-country"
          className={styles.country}
          type="text"
          inputMode="tel"
          autoComplete="tel-country-code"
          maxLength={4}
          value={country}
          onChange={(e) => setCountry(e.target.value)}
        />
        <label htmlFor="sign-in-phone" className={styles.srOnly}>
          Phone number
        </label>
        <input
          id="sign-in-phone"
          className={styles.number}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="(555) 123-4567"
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          aria-invalid={error !== null}
          aria-describedby={error ? "sign-in-error" : "sign-in-hint"}
        />
      </div>
      <p id="sign-in-hint" className={styles.lede}>
        We text you a code. That&apos;s the whole password.
      </p>
      {error && (
        <p id="sign-in-error" role="alert" className={styles.error}>
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <button type="submit" className={styles.primary} disabled={sending}>
          Text me the code
        </button>
      </div>
    </form>
  );
}
