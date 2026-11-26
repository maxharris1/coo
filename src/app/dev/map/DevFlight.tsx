"use client";

import { useState } from "react";
import { FlightMapPreview } from "@/app/(app)/flights/FlightMapPreview";
import { Tracker } from "@/components/Tracker";
import { type FakeParams, fakeFlight, fakeNow } from "./fakeFlight";
import styles from "./flight.module.css";

export function DevFlight({ params }: { params: FakeParams }) {
  const nowMs = fakeNow(params);
  const [offsetMs] = useState(() => nowMs - Date.now());
  const flight = fakeFlight(params);
  if (params.preview) {
    return (
      <main className={styles.page}>
        <div className={styles.preview}>
          <FlightMapPreview
            flight={flight}
            state="flying"
            nowMs={nowMs}
            offsetMs={offsetMs}
          />
        </div>
      </main>
    );
  }
  return (
    <main>
      <Tracker
        flight={flight}
        offsetMs={offsetMs}
        timeZone="America/New_York"
        units="mi"
      />
    </main>
  );
}
