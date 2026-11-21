"use client";

import { useEffect, useId, useState, useSyncExternalStore } from "react";
import {
  acceptAsk,
  browserPushClient,
  createResubscriber,
  shouldAsk,
} from "./push";
import styles from "./PushAsk.module.css";

const ASKED_KEY = "coo.push-asked";
const resubscribe = createResubscriber();

export function PushSheet({
  onYes,
  onNo,
}: {
  onYes: () => void;
  onNo: () => void;
}) {
  const titleId = useId();
  return (
    <div role="dialog" aria-labelledby={titleId} className={styles.sheet}>
      <p id={titleId} className={styles.question}>
        Want a tap on the shoulder when a bird lands?
      </p>
      <div className={styles.answers}>
        <button type="button" className={styles.yes} onClick={onYes}>
          Yes
        </button>
        <button type="button" className={styles.no} onClick={onNo}>
          No
        </button>
      </div>
    </div>
  );
}

const neverChanges = () => () => {};
const wantsAsk = () =>
  shouldAsk(browserPushClient()) && !localStorage.getItem(ASKED_KEY);

export function PushAsk() {
  const ask = useSyncExternalStore(neverChanges, wantsAsk, () => false);
  const [answered, setAnswered] = useState(false);

  useEffect(() => {
    void resubscribe(browserPushClient());
  }, []);

  if (!ask || answered) return null;
  const answer = (yes: boolean) => {
    localStorage.setItem(ASKED_KEY, "1");
    setAnswered(true);
    if (yes) void acceptAsk(browserPushClient());
  };
  return <PushSheet onYes={() => answer(true)} onNo={() => answer(false)} />;
}
