import { useId } from "react";
import { confirmLine, type BuyRow } from "./shop";
import styles from "./ConfirmBuy.module.css";

export function ConfirmBuy({
  row,
  busy,
  onConfirm,
  onCancel,
}: {
  row: BuyRow;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const id = useId();
  return (
    <>
      <div aria-hidden="true" className={styles.scrim} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        aria-busy={busy}
        className={styles.sheet}
      >
        <p id={id} className={styles.question}>
          {confirmLine(row)}
        </p>
        <div className={styles.answers}>
          <button
            type="button"
            className={styles.yes}
            disabled={busy}
            onClick={onConfirm}
          >
            Buy it
          </button>
          <button
            type="button"
            className={styles.no}
            disabled={busy}
            onClick={onCancel}
          >
            Not now
          </button>
        </div>
      </div>
    </>
  );
}
