import { readFileSync } from "node:fs";
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SyncContext, type SyncState } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import { ToastProvider } from "@/components/Toasts";
import type { Earn } from "@/server/services/earn";
import { JobsList, JobsPanel, runningJobs, sendJob } from "./JobsPanel";

type Bird = SyncPayload["birds"][number];

const bird = (over: Partial<Bird>): Bird =>
  ({
    id: "b-gerald",
    name: "Gerald",
    status: "home",
    busyKind: null,
    busyUntil: null,
    ...over,
  }) as Bird;

const JOBS: Earn["jobs"] = {
  offers: [
    {
      id: "job-deli",
      text: "Rush an order slip to the deli on 4th",
      minutes: 12,
      pay: 8,
    },
    {
      id: "job-cat",
      text: "Carry a love note for the bodega cat",
      minutes: 40,
      pay: 15,
    },
  ],
  leftToday: 4,
};

const UNTIL = Date.parse("2026-11-20T19:40:00Z");

const list = (props: Partial<Parameters<typeof JobsList>[0]> = {}) => (
  <JobsList
    jobs={JOBS}
    birds={[bird({})]}
    timeZone="UTC"
    sending={false}
    onSend={() => {}}
    {...props}
  />
);

const html = (props: Partial<Parameters<typeof JobsList>[0]> = {}) =>
  renderToStaticMarkup(list(props));

const buttons = (markup: string) =>
  [...markup.matchAll(/<button[^>]*>.*?<\/button>/gs)].map((m) => m[0]);

function clickables(node: ReactNode): ReactElement<{
  children?: ReactNode;
  onClick?: () => void;
}>[] {
  if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(node))
    return [];
  const own = node.props.onClick ? [node] : [];
  return [...own, ...Children.toArray(node.props.children).flatMap(clickables)];
}

const tree = (props: Partial<Parameters<typeof JobsList>[0]> = {}) =>
  JobsList({
    jobs: JOBS,
    birds: [bird({})],
    timeZone: "UTC",
    sending: false,
    onSend: () => {},
    ...props,
  });

describe("JobsPanel offers (ac-1)", () => {
  it("draws the Odd jobs heading and subline from the mock", () => {
    const markup = html();
    expect(markup).toContain("Odd jobs");
    expect(markup).toContain("For birds with nothing to do");
  });

  it("shows each offer's text, minutes and pay", () => {
    const markup = html();
    expect(markup).toContain("Rush an order slip to the deli on 4th");
    expect(markup).toContain("12 minutes, pays 8 seeds");
    expect(markup).toContain("Carry a love note for the bodega cat");
    expect(markup).toContain("40 minutes, pays 15 seeds");
  });

  it("names the first home bird on each Send button", () => {
    const markup = html({
      birds: [
        bird({ id: "b-ada", name: "Ada", status: "flying" }),
        bird({ id: "b-gerald", name: "Gerald" }),
        bird({ id: "b-pip", name: "Pip" }),
      ],
    });
    const sends = buttons(markup);
    expect(sends).toHaveLength(2);
    for (const b of sends) {
      expect(b).toContain("Send Gerald");
      expect(b).not.toContain("disabled");
    }
  });

  it("sends the offer's id with the home bird's id", () => {
    const onSend = vi.fn();
    const [, second] = clickables(
      tree({
        birds: [bird({ id: "b-pip", name: "Pip" })],
        onSend,
      }),
    );
    second.props.onClick?.();
    expect(onSend).toHaveBeenCalledWith("job-cat", "b-pip");
  });

  it("disables Send with a reason when no bird is home", () => {
    const markup = html({ birds: [bird({ status: "flying" })] });
    for (const b of buttons(markup)) expect(b).toContain("disabled");
    expect(markup).toContain("No bird is home right now.");
  });

  it("disables Send with a reason when today's jobs are used up", () => {
    const markup = html({ jobs: { ...JOBS, leftToday: 0 } });
    for (const b of buttons(markup)) expect(b).toContain("disabled");
    expect(markup).toContain("That&#x27;s all the odd jobs for today.");
  });

  it("disables Send while a job is being sent", () => {
    for (const b of buttons(html({ sending: true })))
      expect(b).toContain("disabled");
  });
});

describe("JobsPanel running jobs (ac-1)", () => {
  const working = bird({
    id: "b-gerald",
    name: "Gerald",
    status: "busy",
    busyKind: "job",
    busyUntil: UNTIL,
  });

  it("finds birds busy on a job and nothing else", () => {
    expect(
      runningJobs([
        working,
        bird({
          id: "b-nap",
          status: "busy",
          busyKind: "nap",
          busyUntil: UNTIL,
        }),
        bird({ id: "b-home" }),
      ]),
    ).toEqual([{ birdId: "b-gerald", name: "Gerald", until: UNTIL }]);
  });

  it("shows a running job with its return time in the profile timezone", () => {
    const markup = html({ birds: [working], timeZone: "America/New_York" });
    expect(markup).toContain("Gerald is out on an odd job. Home at 2:40 pm.");
  });

  it("does not show a napping bird as a job", () => {
    const markup = html({
      birds: [bird({ status: "busy", busyKind: "nap", busyUntil: UNTIL })],
    });
    expect(markup).not.toContain("odd job.");
  });
});

describe("sendJob (ac-1)", () => {
  it("starts the job, then refreshes sync and Earn", async () => {
    const calls: string[] = [];
    const start = vi.fn(async () => {
      calls.push("start");
      return { ok: true as const, data: null };
    });
    const toast = vi.fn();
    await sendJob(
      "job-deli",
      "b-gerald",
      start,
      () => calls.push("refresh"),
      () => calls.push("changed"),
      toast,
    );
    expect(start).toHaveBeenCalledWith("job-deli", "b-gerald");
    expect(calls).toEqual(["start", "refresh", "changed"]);
    expect(toast).not.toHaveBeenCalled();
  });

  it("shows the server's refusal as a toast", async () => {
    const toast = vi.fn();
    const refresh = vi.fn();
    await sendJob(
      "job-deli",
      "b-gerald",
      async () => ({ ok: false, message: "Gerald is not home right now." }),
      refresh,
      () => {},
      toast,
    );
    expect(toast).toHaveBeenCalledWith("Gerald is not home right now.");
    expect(refresh).toHaveBeenCalled();
  });
});

describe("JobsPanel mounted (ac-1)", () => {
  const render = (data: SyncPayload | null) =>
    renderToStaticMarkup(
      <SyncContext.Provider
        value={
          {
            data,
            error: null,
            offsetMs: 0,
            refresh: () => {},
          } satisfies SyncState
        }
      >
        <ToastProvider>
          <JobsPanel jobs={JOBS} found={[]} onChanged={() => {}} />
        </ToastProvider>
      </SyncContext.Provider>,
    );

  it("reads birds and the timezone from sync", () => {
    const markup = render({
      me: { timezone: "America/New_York" },
      birds: [
        bird({
          id: "b-ada",
          name: "Ada",
          status: "busy",
          busyKind: "job",
          busyUntil: UNTIL,
        }),
        bird({ id: "b-gerald", name: "Gerald" }),
      ],
    } as unknown as SyncPayload);
    expect(markup).toContain("Ada is out on an odd job. Home at 2:40 pm.");
    expect(markup).toContain("Send Gerald");
  });

  it("keeps Send disabled until the first sync lands", () => {
    const markup = render(null);
    expect(markup).toContain("Rush an order slip to the deli on 4th");
    for (const b of buttons(markup)) expect(b).toContain("disabled");
  });
});

describe("JobsPanel styles", () => {
  const css = readFileSync(
    new URL("./Earn.module.css", import.meta.url),
    "utf8",
  );

  it("gives the Send button a 44 px touch target in sun yellow", () => {
    expect(css).toMatch(/\.send\s*{[^}]*min-height:\s*var\(--coo-touch\)/);
    expect(css).toMatch(/\.send\s*{[^}]*background:\s*var\(--coo-sun\)/);
  });
});
