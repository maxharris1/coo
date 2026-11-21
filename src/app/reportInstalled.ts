type Session = { userId: string; onboarded: boolean };

export function createInstallReporter() {
  const reported = new Set<string>();
  let pending = false;
  let queued: typeof fetch | null = null;

  async function reportCurrent(fetchImpl: typeof fetch): Promise<void> {
    const getSession = async (): Promise<Session | null> => {
      const res = await fetchImpl("/api/auth/session");
      return res.ok ? ((await res.json()) as Session) : null;
    };
    try {
      let session = await getSession();
      while (session?.onboarded && !reported.has(session.userId)) {
        const res = await fetchImpl("/api/settings", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ installed: true, account: session.userId }),
        });
        if (res.ok) {
          reported.add(session.userId);
          return;
        }
        if (res.status !== 409) return;
        const current = await getSession();
        if (current?.userId === session.userId) return;
        session = current;
      }
    } catch {
      return;
    }
  }

  return async function reportInstalled(
    isStandalone: boolean,
    fetchImpl: typeof fetch = fetch,
  ): Promise<void> {
    if (!isStandalone) return;
    if (pending) {
      queued = fetchImpl;
      return;
    }
    pending = true;
    try {
      let next: typeof fetch | null = fetchImpl;
      while (next) {
        queued = null;
        await reportCurrent(next);
        next = queued;
      }
    } finally {
      pending = false;
    }
  };
}
