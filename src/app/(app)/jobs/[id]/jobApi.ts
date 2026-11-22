import type { JobView } from "@/server/services/jobs/get";

export type JobResult =
  { ok: true; job: JobView } | { ok: false; code: string };

export async function loadJob(
  fetchFn: typeof fetch,
  id: string,
): Promise<JobResult> {
  try {
    const res = await fetchFn(`/api/jobs/${encodeURIComponent(id)}`, {
      cache: "no-store",
    });
    const json: unknown = await res.json().catch(() => null);
    if (res.ok) {
      const body = json as { job: JobView };
      return { ok: true, job: body.job };
    }
    const code = (json as { error?: { code?: unknown } } | null)?.error?.code;
    return { ok: false, code: typeof code === "string" ? code : "unreachable" };
  } catch {
    return { ok: false, code: "unreachable" };
  }
}
