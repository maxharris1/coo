"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { JobError } from "./JobError";
import { JobTracker } from "./JobTracker";
import { type JobResult, loadJob } from "./jobApi";

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const { offsetMs } = useSync();
  const [result, setResult] = useState<JobResult | null>(null);

  useEffect(() => {
    let live = true;
    void loadJob(fetch, id).then((r) => {
      if (live) setResult(r);
    });
    return () => {
      live = false;
    };
  }, [id]);

  if (!result) return <Loader />;
  if (!result.ok) return <JobError code={result.code} />;
  return (
    <JobTracker
      job={result.job}
      offsetMs={offsetMs}
      timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
    />
  );
}
