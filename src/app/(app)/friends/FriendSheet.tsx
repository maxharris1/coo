import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import type { FriendRow } from "@/server/services/friends";
import { nextHref } from "../send/recipients";
import styles from "./FriendSheet.module.css";

export type SheetStep = "menu" | "unfriend" | "block" | "report";

export type SheetState = { friend: FriendRow; step: SheetStep; busy: boolean };

export type FriendSheetProps = SheetState & {
  onStep: (step: SheetStep) => void;
  onClose: () => void;
  onConfirm: (reason: string) => void;
};

const CONFIRMS: Record<
  "unfriend" | "block",
  { title: (name: string) => string; line: string; confirm: string }
> = {
  unfriend: {
    title: (name) => `Unfriend ${name}?`,
    line: "Birds already in the air finish their flights.",
    confirm: "Unfriend",
  },
  block: {
    title: (name) => `Block ${name}?`,
    line: "They can't send you birds. A bird of theirs on your sill goes home now.",
    confirm: "Block",
  },
};

const REASON_MAX = 500;

function ReportForm({
  busy,
  onStep,
  onConfirm,
}: Pick<FriendSheetProps, "busy" | "onStep" | "onConfirm">) {
  const [reason, setReason] = useState("");
  const fieldId = useId();
  const trimmed = reason.trim();
  return (
    <>
      <label htmlFor={fieldId} className={styles.label}>
        What happened?
      </label>
      <textarea
        id={fieldId}
        className={styles.field}
        maxLength={REASON_MAX}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <div className={styles.actions}>
        <button
          type="button"
          className={`${styles.button} ${styles.confirm}`}
          disabled={!trimmed || busy}
          onClick={() => onConfirm(trimmed)}
        >
          Send report
        </button>
        <button
          type="button"
          className={styles.button}
          onClick={() => onStep("menu")}
        >
          Cancel
        </button>
      </div>
    </>
  );
}

export function FriendSheet({
  friend,
  step,
  busy,
  onStep,
  onClose,
  onConfirm,
}: FriendSheetProps) {
  const titleId = useId();
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialog.current?.focus();
  }, [step]);

  const title =
    step === "menu"
      ? friend.name
      : step === "report"
        ? `Report ${friend.name}`
        : CONFIRMS[step].title(friend.name);

  return (
    <div className={styles.layer}>
      <button
        type="button"
        aria-label="Close"
        className={styles.scrim}
        onClick={onClose}
      />
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={styles.sheet}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <span aria-hidden="true" className={styles.grab} />
        <h2 id={titleId} className={styles.title}>
          {title}
        </h2>

        {step === "menu" && (
          <div className={styles.actions}>
            <Link href={nextHref([friend.id])} className={styles.button}>
              Send a bird
            </Link>
            <Link
              href={`/shoebox?friend=${encodeURIComponent(friend.id)}`}
              className={styles.button}
            >
              Shoebox with them
            </Link>
            <button
              type="button"
              className={styles.button}
              onClick={() => onStep("unfriend")}
            >
              Unfriend
            </button>
            <button
              type="button"
              className={styles.button}
              onClick={() => onStep("block")}
            >
              Block
            </button>
            <button
              type="button"
              className={styles.button}
              onClick={() => onStep("report")}
            >
              Report
            </button>
          </div>
        )}

        {(step === "unfriend" || step === "block") && (
          <>
            <p className={styles.line}>{CONFIRMS[step].line}</p>
            <div className={styles.actions}>
              <button
                type="button"
                className={`${styles.button} ${styles.confirm}`}
                disabled={busy}
                onClick={() => onConfirm("")}
              >
                {CONFIRMS[step].confirm}
              </button>
              <button
                type="button"
                className={styles.button}
                onClick={() => onStep("menu")}
              >
                Cancel
              </button>
            </div>
          </>
        )}

        {step === "report" && (
          <ReportForm busy={busy} onStep={onStep} onConfirm={onConfirm} />
        )}
      </div>
    </div>
  );
}
