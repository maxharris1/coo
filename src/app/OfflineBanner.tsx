"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import emptyStates from "../../assets/copy/empty-states.json";
import styles from "./OfflineBanner.module.css";

const OFFLINE_LINE = emptyStates.find((s) => s.state === "Offline")!.text;

export const onlineStore = {
  subscribe(onChange: () => void) {
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    return () => {
      window.removeEventListener("online", onChange);
      window.removeEventListener("offline", onChange);
    };
  },
  getSnapshot: () => navigator.onLine,
  getServerSnapshot: () => true,
};

export function OfflineLine() {
  return (
    <p role="status" className={styles.line}>
      {OFFLINE_LINE}
    </p>
  );
}

export function OfflineBanner() {
  const online = useSyncExternalStore(
    onlineStore.subscribe,
    onlineStore.getSnapshot,
    onlineStore.getServerSnapshot,
  );
  const path = usePathname();
  if (online || path === "/offline") return null;
  return <OfflineLine />;
}
