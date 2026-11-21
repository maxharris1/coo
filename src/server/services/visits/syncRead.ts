import type { Pronoun } from "@/lib/format";
import type { BreedId, GearId } from "@/lib/game/types";
import type { Deps } from "@/server/deps";

type BirdLite = {
  id: string;
  name: string;
  breed: BreedId;
  look: string;
  pronoun: Pronoun;
  speedMph: number;
  gear: GearId[];
};
type PersonLite = { id: string; name: string; handle: string };
type DelayKind = "none" | "minor" | "major";

export type SyncVisit = {
  id: string;
  bird: BirdLite;
  owner: PersonLite;
  note: { id: string; body: string; createdAt: number };
  arrivedAt: number;
  leavesAt: number;
  status: "waiting";
  snackGiven: boolean;
  flight: {
    distanceMi: number | null;
    durationMs: number | null;
    delayKind: DelayKind | null;
  };
};

export type MyVisiting = { birdId: string; hostName: string; leavesAt: number };

type VisitRow = {
  id: string;
  arrived_at: Date;
  leaves_at: Date;
  snack_given: boolean;
  bird_id: string;
  bird_name: string;
  breed: string;
  look: string;
  pronoun: string;
  speed_mph: number;
  gear: string[];
  owner_id: string;
  owner_name: string;
  owner_handle: string;
  note_id: string;
  note_body: string;
  note_created_at: Date;
  distance_mi: number | null;
  delay_kind: DelayKind | null;
  release_at: Date;
  arrive_at: Date | null;
};

type MyVisitingRow = { bird_id: string; host_name: string; leaves_at: Date };

export async function syncVisits(
  deps: Deps,
  userId: string,
): Promise<{ visits: SyncVisit[]; myVisiting: MyVisiting[] }> {
  const now = new Date(deps.clock.now()).toISOString();
  const [visitRows, myRows] = await Promise.all([
    deps.db.query<VisitRow>(
      `select v.id, v.arrived_at, v.leaves_at, v.snack_given,
              b.id as bird_id, b.name as bird_name, b.breed, b.look, b.pronoun, b.speed_mph, b.gear,
              o.id as owner_id, o.name as owner_name, o.handle as owner_handle,
              n.id as note_id, n.body as note_body, n.created_at as note_created_at,
              f.distance_mi, f.delay_kind, f.release_at, f.arrive_at
         from visits v
         join birds b on b.id = v.bird_id
         join profiles o on o.id = b.owner_id
         join notes n on n.id = v.note_id
         join flights f on f.id = v.flight_id
        where v.host_id = $1 and v.status = 'waiting' and v.leaves_at > $2
        order by v.arrived_at desc, v.id`,
      [userId, now],
    ),
    deps.db.query<MyVisitingRow>(
      `select v.bird_id, h.name as host_name, v.leaves_at
         from visits v
         join birds b on b.id = v.bird_id
         join profiles h on h.id = v.host_id
        where b.owner_id = $1 and v.status = 'waiting' and v.leaves_at > $2
        order by v.leaves_at, v.id`,
      [userId, now],
    ),
  ]);

  return {
    visits: visitRows.map((r) => ({
      id: r.id,
      bird: {
        id: r.bird_id,
        name: r.bird_name,
        breed: r.breed as BreedId,
        look: r.look,
        pronoun: r.pronoun as Pronoun,
        speedMph: r.speed_mph,
        gear: r.gear as GearId[],
      },
      owner: { id: r.owner_id, name: r.owner_name, handle: r.owner_handle },
      note: {
        id: r.note_id,
        body: r.note_body,
        createdAt: r.note_created_at.getTime(),
      },
      arrivedAt: r.arrived_at.getTime(),
      leavesAt: r.leaves_at.getTime(),
      status: "waiting",
      snackGiven: r.snack_given,
      flight: {
        distanceMi: r.distance_mi,
        durationMs: r.arrive_at
          ? r.arrive_at.getTime() - r.release_at.getTime()
          : null,
        delayKind: r.delay_kind,
      },
    })),
    myVisiting: myRows.map((r) => ({
      birdId: r.bird_id,
      hostName: r.host_name,
      leavesAt: r.leaves_at.getTime(),
    })),
  };
}
