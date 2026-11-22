import { config } from "@/lib/config";
import { activeLoft, snap } from "@/lib/game/privacy";
import type { Deps } from "@/server/deps";
import { AppError } from "@/server/errors";
import type { UserId } from "@/server/ports/auth";
import type { BirdLite, Place } from "@/server/services/flights/shape";
import {
  LOFT_COLUMNS,
  loftsOf,
  type LoftColumns,
} from "@/server/services/friends";

export type JobView = {
  id: string;
  jobId: string;
  text: string;
  short: string;
  startedAt: string;
  endsAt: string;
  status: "running" | "done";
  bird: BirdLite;
  map: { loft: Place; dest: Place } | null;
};

type JobRow = LoftColumns & {
  id: string;
  job_id: string;
  started_at: Date;
  ends_at: Date;
  status: JobView["status"];
  dest_lat: number | null;
  dest_lon: number | null;
  dest_label: string | null;
  bird_id: string;
  bird_name: string;
  bird_look: string;
  bird_gear: string[];
};

function mapOf(r: JobRow): JobView["map"] {
  const loft = activeLoft(loftsOf(r));
  if (
    !loft ||
    r.dest_lat === null ||
    r.dest_lon === null ||
    r.dest_label === null
  )
    return null;
  return {
    loft: { ...snap(loft.roost.lat, loft.roost.lon), label: loft.label },
    dest: { ...snap(r.dest_lat, r.dest_lon), label: r.dest_label },
  };
}

export async function getJob(
  deps: Deps,
  userId: UserId,
  id: string,
): Promise<JobView> {
  const [row] = await deps.db.query<JobRow>(
    `select j.id, j.job_id, j.started_at, j.ends_at, j.status,
       j.dest_lat, j.dest_lon, j.dest_label,
       b.id as bird_id, b.name as bird_name, b.look as bird_look, b.gear as bird_gear,
       ${LOFT_COLUMNS.map((c) => `p.${c}`).join(", ")}
     from jobs j
     join birds b on b.id = j.bird_id
     join profiles p on p.id = j.user_id
     where j.id = $2 and j.user_id = $1`,
    [userId, id],
  );
  const job = row && config.jobs.jobs.find((j) => j.id === row.job_id);
  if (!job) throw new AppError("not_found", "No such job");
  return {
    id: row.id,
    jobId: job.id,
    text: job.text,
    short: job.short,
    startedAt: row.started_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    status: row.status,
    bird: {
      id: row.bird_id,
      name: row.bird_name,
      look: row.bird_look,
      gear: row.bird_gear,
    },
    map: mapOf(row),
  };
}
