"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Fragment,
  useEffect,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { flushSync } from "react-dom";
import type { E164 } from "@/lib/phone";
import styles from "../../auth.module.css";
import { useSignInPhone } from "../phone";
import { postAuth } from "../postAuth";
import {
  canResend,
  code,
  CODE_LENGTH,
  initialCode,
  isComplete,
  type CodeAction,
  type CodeState,
} from "./code";

export function CodeForm({ initial }: { initial?: CodeState }) {
  const router = useRouter();
  const { phone } = useSignInPhone();
  const [now, setNow] = useState(() => Date.now());
  const [state, dispatch] = useReducer(
    code,
    initial,
    (given) => given ?? initialCode(now),
  );
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (canResend(state, now)) return;
    const timer = setTimeout(() => setNow(Date.now()), state.resendAt - now);
    return () => clearTimeout(timer);
  }, [state, now]);

  const verify = async (digits: readonly string[]) => {
    dispatch({ type: "checking" });
    const result = await postAuth("/api/auth/verify", {
      code: digits.join(""),
    });
    if (result.ok) {
      router.push(result.next);
      return;
    }
    flushSync(() => dispatch({ type: "failed", message: result.message }));
    boxes.current[0]?.focus();
  };

  const change = (index: number, value: string) => {
    const old = state.digits[index];
    const text = old && value.length === 2 ? value.replace(old, "") : value;
    if (text === "") {
      dispatch({ type: "erased", index });
      return;
    }
    const whole = text.replace(/\D/g, "").length >= CODE_LENGTH;
    const action: CodeAction = {
      type: "typed",
      index: whole ? 0 : index,
      text,
    };
    const next = code(state, action);
    dispatch(action);
    if (isComplete(next)) {
      void verify(next.digits);
      return;
    }
    boxes.current[next.digits.indexOf("")]?.focus();
  };

  const keyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Backspace" || state.digits[index] !== "" || index === 0) {
      return;
    }
    e.preventDefault();
    dispatch({ type: "erased", index: index - 1 });
    boxes.current[index - 1]?.focus();
  };

  const resend = async (to: E164) => {
    const result = await postAuth("/api/auth/code", { phone: to });
    if (!result.ok) {
      dispatch({ type: "failed", message: result.message });
      return;
    }
    dispatch({ type: "resent", now: Date.now() });
    boxes.current[0]?.focus();
  };

  return (
    <div className={styles.form}>
      <div className={styles.codeRow}>
        {state.digits.map((digit, i) => (
          <Fragment key={i}>
            <label htmlFor={`code-digit-${i + 1}`} className={styles.srOnly}>
              {`Digit ${i + 1} of ${CODE_LENGTH}`}
            </label>
            <input
              ref={(el) => {
                boxes.current[i] = el;
              }}
              id={`code-digit-${i + 1}`}
              className={styles.digit}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={CODE_LENGTH}
              pattern="[0-9]*"
              autoFocus={i === 0}
              value={digit}
              disabled={state.phase === "checking"}
              onChange={(e) => change(i, e.target.value)}
              onKeyDown={(e) => keyDown(i, e)}
            />
          </Fragment>
        ))}
      </div>
      <p
        aria-live="polite"
        className={state.message ? styles.error : undefined}
      >
        {state.message ?? ""}
      </p>
      {canResend(state, now) && (
        <div className={styles.actions}>
          {phone ? (
            <button
              type="button"
              className={styles.secondary}
              onClick={() => void resend(phone)}
            >
              Send it again
            </button>
          ) : (
            <Link href="/sign-in" className={styles.secondary}>
              Send it again
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
