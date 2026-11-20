type Session = { userId: string; onboarded: boolean };

export function createInstallReporter() {
  const reported = new Set<string>();
  let pending = false;
  return async function reportInstalled(
    isStandalone: boolean,
    fetchImpl: typeof fetch = fetch,
  ): Promise<void> {
    if (!isStandalone || pending) return;
    pending = true;
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
    } finally {
      pending = false;
    }
  };
}
