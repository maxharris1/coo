"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSync } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import { useToast } from "@/components/Toasts";
import { earnTop, loadEarn, type EarnState } from "./earn";
import { EarnView } from "./EarnView";

const earnSignal = (data: SyncPayload | null): string | null =>
  data &&
  JSON.stringify([
    data.me.seeds,
    data.punchCard,
    data.birds.map((b) => [b.id, b.status, b.busyKind, b.busyUntil]),
    data.flights.map((f) => [f.id, f.status]),
    data.jobs,
    data.found,
  ]);

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

  const signal = earnSignal(useSync().data);
  const seen = useRef(signal);
  useEffect(() => {
    if (signal === null || signal === seen.current) return;
    seen.current = signal;
    void load();
  }, [signal, load]);

  const onRetry = () => {
    setState({ kind: "loading" });
    void load();
  };

  return <EarnView state={state} onRetry={onRetry} onChanged={load} />;
}
