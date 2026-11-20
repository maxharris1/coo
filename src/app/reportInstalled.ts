export function createInstallReporter() {
  const reported = new Set<string>();
  let pending = false;
  return async function reportInstalled(
    isStandalone: boolean,
    fetchImpl: typeof fetch = fetch,
  ): Promise<void> {
    if (!isStandalone || pending) return;
    pending = true;
    try {
      const session = await fetchImpl("/api/auth/session");
      if (!session.ok) return;
      const { userId, onboarded } = (await session.json()) as {
        userId: string;
        onboarded: boolean;
      };
      if (!onboarded || reported.has(userId)) return;
      const res = await fetchImpl("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ installed: true }),
      });
      if (res.ok) reported.add(userId);
    } catch {
      return;
    } finally {
      pending = false;
    }
  };
}
