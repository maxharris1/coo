"use client";

import { useState, useSyncExternalStore } from "react";
import { lastPage } from "@/components/lastPage";
import { ReportBugView, type ReportBugStatus } from "./ReportBugView";
import { createReportSender, readContext } from "./submit";

const FALLBACK_ROUTE = "/more";
const unchanging = () => () => {};

function cameFrom(): string {
  try {
    return lastPage(window.sessionStorage);
  } catch {
    return FALLBACK_ROUTE;
  }
}

export default function ReportBugPage() {
  const route = useSyncExternalStore(
    unchanging,
    cameFrom,
    () => FALLBACK_ROUTE,
  );
  const [sender] = useState(() =>
    createReportSender(fetch, () => crypto.randomUUID()),
  );
  const [text, setText] = useState("");
  const [status, setStatus] = useState<ReportBugStatus>({
    kind: "editing",
    error: null,
  });

  async function send() {
    const pending = sender.send(text, readContext(route, window));
    if (!pending) return;
    setStatus({ kind: "sending" });
    const result = await pending;
    setStatus(
      result.ok ? { kind: "sent" } : { kind: "editing", error: result.reason },
    );
  }

  return (
    <ReportBugView
      text={text}
      route={route}
      status={status}
      onText={setText}
      onSend={() => void send()}
    />
  );
}
