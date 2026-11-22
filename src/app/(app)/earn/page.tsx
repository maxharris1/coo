"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSync } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import { useToast } from "@/components/Toasts";
import { earnTop, loadEarn, type EarnState } from "./earn";
import { EarnView } from "./EarnView";

const homeBirds = (data: SyncPayload | null): string | null =>
  data &&
  data.birds
    .filter((b) => b.status === "home")
    .map((b) => b.id)
    .sort()
    .join(" ");

const cameHome = (before: string, after: string): boolean => {
  const was = new Set(before.split(" "));
  return after.split(" ").some((id) => id && !was.has(id));
};

export default function EarnPage() {
  const [state, setState] = useState<EarnState>({ kind: "loading" });
  const toast = useToast();
  const live = useRef(true);
  const latest = useRef(0);

  const load = useCallback(() => {
    const request = ++latest.current;
    return loadEarn().then((r) => {
      if (!live.current || request !== latest.current) return;
      if (r.ok) {
        setState({
          kind: "ready",
          top: earnTop(r.data),
          jobs: r.data.jobs,
          found: r.data.found,
        });
      } else {
        setState({ kind: "failed", message: r.message });
        toast(r.message);
      }
    });
  }, [toast]);

  useEffect(() => {
    live.current = true;
    void load();
    return () => {
      live.current = false;
    };
  }, [load]);

  const home = homeBirds(useSync().data);
  const seenHome = useRef(home);
  useEffect(() => {
    const before = seenHome.current;
    seenHome.current = home;
    if (home !== null && (before === null || cameHome(before, home)))
      void load();
  }, [home, load]);

  const onRetry = () => {
    setState({ kind: "loading" });
    void load();
  };

  return <EarnView state={state} onRetry={onRetry} onChanged={load} />;
}
