type State = "idle" | "pending" | "done";

export function createInstallReporter() {
  let state: State = "idle";
  return async function reportInstalled(
    isStandalone: boolean,
    fetchImpl: typeof fetch = fetch,
  ): Promise<void> {
    if (!isStandalone || state !== "idle") return;
    state = "pending";
    try {
      const res = await fetchImpl("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ installed: true }),
      });
      state = res.ok ? "done" : "idle";
    } catch {
      state = "idle";
    }
  };
}
