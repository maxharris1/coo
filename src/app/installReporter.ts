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
        const current = await getSession();
        if (current?.userId !== session.userId) {
          session = current;
          continue;
        }
        const res = await fetchImpl("/api/settings", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ installed: true }),
        });
        if (res.ok) {
          const { me } = (await res.json()) as { me: { id: string } };
          reported.add(me.id);
        }
        return;
      }
    } catch {
      return;
    } finally {
      pending = false;
    }
  };
}
