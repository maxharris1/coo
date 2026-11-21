"use client";

import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { MainTop } from "./MainTop";

export default function MainPage() {
  const { data } = useSync();
  if (!data) return <Loader />;
  return <MainTop data={data} nowMs={data.serverNow} />;
}
