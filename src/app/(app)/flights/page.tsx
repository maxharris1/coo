"use client";

import { useEffect, useMemo, useState } from "react";
import { useSync } from "@/components/SyncProvider";
import { useToast } from "@/components/Toasts";
import { asUnits } from "@/lib/format";
import type { FlightsPage as Page } from "@/server/services/flights/list";
import type { JobView } from "@/server/services/jobs/get";
import { onJob } from "../earn/JobsPanel";
import { call } from "../friends/friendsApi";
import { loadJob } from "../jobs/[id]/jobApi";
import { FlightsView, type List } from "./FlightsView";
import { ALL_PAST, type GroupKey, type PastFilter } from "./flightsViewModel";

const TICK_MS = 10_000;

async function loadFlights(cursor: string | null) {
  const search = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  const r = await call(fetch, `/api/flights${search}`);
  return r.ok ? { ok: true as const, page: r.json as Page } : r;
}

export default function FlightsPage() {
  const { data, offsetMs } = useSync();
  const toast = useToast();
  const [list, setList] = useState<List>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [toggled, setToggled] = useState<Partial<Record<GroupKey, boolean>>>(
    {},
  );
  const [hops, setHops] = useState<Partial<Record<GroupKey, boolean>>>({});
  const [filter, setFilter] = useState<PastFilter>(ALL_PAST);
  const [clock, setClock] = useState(() => Date.now());
  const synced = useMemo(() => JSON.stringify(data?.flights ?? null), [data]);
  const [jobs, setJobs] = useState<ReadonlyMap<string, JobView>>(new Map());
  const jobIds = (data?.birds ?? [])
    .filter(onJob)
    .flatMap((b) => (b.jobId ? [b.jobId] : []))
    .join(" ");

  useEffect(() => {
    let live = true;
    for (const id of jobIds.split(" ").filter(Boolean)) {
      void loadJob(fetch, id).then((r) => {
        if (live && r.ok) setJobs((prev) => new Map(prev).set(id, r.job));
      });
    }
    return () => {
      live = false;
    };
  }, [jobIds]);

  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let live = true;
    void loadFlights(null).then((r) => {
      if (!live) return;
      setList((prev) => {
        if (!r.ok) {
          return prev.kind === "ready"
            ? prev
            : { kind: "failed", message: r.message };
        }
        if (prev.kind !== "ready") {
          return { kind: "ready", loadingMore: false, ...r.page };
        }
        const fresh = new Set(r.page.earlier.map((f) => f.id));
        return {
          ...prev,
          ...r.page,
          earlier: [
            ...r.page.earlier,
            ...prev.earlier.filter((f) => !fresh.has(f.id)),
          ],
          nextCursor: prev.nextCursor,
        };
      });
    });
    return () => {
      live = false;
    };
  }, [attempt, synced]);

  const onRetry = () => {
    setList({ kind: "loading" });
    setAttempt((n) => n + 1);
  };

  const onMore = () => {
    if (list.kind !== "ready" || !list.nextCursor || list.loadingMore) return;
    const cursor = list.nextCursor;
    setList({ ...list, loadingMore: true });
    void loadFlights(cursor).then((r) => {
      if (!r.ok) toast(r.message);
      setList((prev) => {
        if (prev.kind !== "ready" || prev.nextCursor !== cursor) return prev;
        if (!r.ok) return { ...prev, loadingMore: false };
        const seen = new Set(prev.earlier.map((f) => f.id));
        return {
          ...prev,
          loadingMore: false,
          nextCursor: r.page.nextCursor,
          earlier: [
            ...prev.earlier,
            ...r.page.earlier.filter((f) => !seen.has(f.id)),
          ],
        };
      });
    });
  };

  return (
    <FlightsView
      list={list}
      birds={data?.birds ?? []}
      jobs={jobs}
      nowMs={clock + offsetMs}
      offsetMs={offsetMs}
      timeZone={
        data?.me.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone
      }
      units={asUnits(data?.me.units)}
      toggled={toggled}
      onToggle={(key, open) => setToggled((prev) => ({ ...prev, [key]: open }))}
      hops={hops}
      onHops={(key, open) => setHops((prev) => ({ ...prev, [key]: open }))}
      filter={filter}
      onFilter={setFilter}
      onMore={onMore}
      onRetry={onRetry}
    />
  );
}
