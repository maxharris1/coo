"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import styles from "./AppShell.module.css";
import { RealtimeNudge } from "./RealtimeNudge";
import { chromeFor } from "./shell";
import { SyncProvider } from "./SyncProvider";
import { TabBar } from "./TabBar";
import { ToastProvider } from "./Toasts";

export function AppShell({ children }: { children: ReactNode }) {
  const chrome = chromeFor(usePathname());
  if (chrome === "bare") return children;
  return (
    <SyncProvider>
      <ToastProvider>
        <RealtimeNudge />
        <div className={chrome === "tabs" ? styles.withTabs : styles.column}>
          {children}
        </div>
        {chrome === "tabs" && <TabBar />}
      </ToastProvider>
    </SyncProvider>
  );
}
