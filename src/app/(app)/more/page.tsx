"use client";

import { useEffect, useRef, useState } from "react";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { loadMoreSources, type MoreSources } from "./more";
import { MoreView } from "./MoreView";

export default function MorePage() {
  const { data } = useSync();
  const [fetched, setFetched] = useState<MoreSources | null>(null);
  const mounted = useRef(false);
  const loading = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!data || loading.current) return;
    loading.current = true;
    void loadMoreSources(data, fetch).then((sources) => {
      loading.current = false;
      if (mounted.current) setFetched(sources);
    });
  }, [data]);

  if (!data) return <Loader />;
  return (
    <MoreView
      sources={
        fetched
          ? { ...fetched, sync: data }
          : { sync: data, friends: null, notes: null, collection: null }
      }
    />
  );
}
