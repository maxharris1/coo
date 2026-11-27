"use client";

import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { useToast } from "@/components/Toasts";
import { feedBird } from "./feed";
import { Flock } from "./Flock";
import { feedThenRefresh } from "./flockRows";
import { MainTop } from "./MainTop";
import { PushAsk } from "./PushAsk";

export default function MainPage() {
  const { data, offsetMs, refresh } = useSync();
  const toast = useToast();
  if (!data) return <Loader />;
  return (
    <>
      <MainTop data={data} nowMs={data.serverNow} offsetMs={offsetMs} />
      <Flock
        data={data}
        onFeed={(id) => void feedThenRefresh(id, feedBird, refresh, toast)}
      />
      <PushAsk />
    </>
  );
}
