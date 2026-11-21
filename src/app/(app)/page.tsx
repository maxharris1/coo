"use client";

import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { feedBird } from "./feed";
import { Flock } from "./Flock";
import { feedThenRefresh } from "./flockRows";
import { MainTop } from "./MainTop";

export default function MainPage() {
  const { data, refresh } = useSync();
  if (!data) return <Loader />;
  return (
    <>
      <MainTop data={data} nowMs={data.serverNow} />
      <Flock
        data={data}
        onFeed={(id) => void feedThenRefresh(id, feedBird, refresh)}
      />
    </>
  );
}
