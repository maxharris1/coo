"use client";

import { useEffect, useState } from "react";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { loadMoreSources, type MoreSources } from "./more";
import { MoreView } from "./MoreView";

export default function MorePage() {
  const { data } = useSync();
  const [fetched, setFetched] = useState<MoreSources | null>(null);

  useEffect(() => {
    if (!data) return;
    let live = true;
    void loadMoreSources(data, fetch).then((sources) => {
      if (live) setFetched(sources);
    });
    return () => {
      live = false;
    };
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
