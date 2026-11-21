import type { Earn } from "@/server/services/earn";

export type Stamp = "punched" | "open" | "prize";

export type PayRow = { label: string; value: string };

export type EarnTop = {
  seeds: number;
  week: string;
  stamps: Stamp[];
  line: string;
  pay: PayRow[];
};

export type EarnState =
  | { kind: "loading" }
  | { kind: "failed"; message: string }
  | { kind: "ready"; top: EarnTop; jobs: Earn["jobs"]; found: Earn["found"] };

const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

const weekLabel = (weekStart: string): string => {
  const [, month, day] = weekStart.split("-").map(Number);
  return `WEEK OF ${MONTHS[month - 1]} ${day}`;
};

export function earnTop({ seeds, punchCard, payTable }: Earn): EarnTop {
  const { weekStart, deliveries, size, pay, paid } = punchCard;
  const count = Math.min(deliveries, size);
  const stamps = Array.from({ length: size }, (_, i): Stamp =>
    i < deliveries ? "punched" : i === size - 1 ? "prize" : "open",
  );
  const { delivery, replyHome, newCity, partyHatWeekend } = payTable;
  const rows: PayRow[] = [
    {
      label: "A note lands",
      value: `${delivery.base}, plus 1 per ${delivery.milesPerBonusSeed} miles`,
    },
    { label: "Your bird comes home with a reply", value: `${replyHome}` },
    {
      label: "First landing in a new city",
      value: `${newCity} and a postmark`,
    },
  ];
  if (partyHatWeekend !== null)
    rows.push({
      label: "A weekend delivery in your party hat",
      value: `${partyHatWeekend} extra`,
    });
  return {
    seeds,
    week: weekLabel(weekStart),
    stamps,
    line: `${count} of ${size} deliveries this week. ${
      paid ? `The full card paid ${pay}` : `A full card pays ${pay}`
    } seeds.`,
    pay: rows,
  };
}

const UNREACHABLE = "We could not reach the loft. Try again.";

type Result<T> =
  { ok: true; data: T } | { ok: false; message: string; code?: string };
type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

async function call<T>(fetchImpl: Fetch, url: string): Promise<Result<T>> {
  try {
    const res = await fetchImpl(url);
    const json: unknown = await res.json().catch(() => null);
    if (res.ok && json !== null) return { ok: true, data: json as T };
    const error = (
      json as { error?: { code?: unknown; message?: unknown } } | null
    )?.error;
    const message = error?.message;
    return {
      ok: false,
      message: typeof message === "string" && message ? message : UNREACHABLE,
      ...(typeof error?.code === "string" && { code: error.code }),
    };
  } catch {
    return { ok: false, message: UNREACHABLE };
  }
}

export const loadEarn = (fetchImpl: Fetch = fetch, flightId?: string) =>
  call<Earn>(
    fetchImpl,
    flightId ? `/api/earn?flight=${encodeURIComponent(flightId)}` : "/api/earn",
  );
