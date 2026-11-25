import { describe, expect, it, vi } from "vitest";
import { detectPlatform, type Platform } from "@/lib/platform";
import { snapshot, UA } from "@/test/fixtures/platform";
import {
  installFlow,
  installStep,
  watchInstall,
  type InstallAction,
  type InstallState,
} from "./installFlow";

describe("installStep", () => {
  const cases: [Platform, InstallState][] = [
    [{ kind: "installed" }, { kind: "done" }],
    [{ kind: "other" }, { kind: "skip" }],
    [{ kind: "ios-safari" }, { kind: "ios" }],
    [{ kind: "prompt" }, { kind: "prompt" }],
    [{ kind: "prompt-pending" }, { kind: "waiting" }],
    [
      { kind: "in-app", openIn: "Chrome" },
      { kind: "in-app", openIn: "Chrome" },
    ],
    [
      { kind: "in-app", openIn: "Safari" },
      { kind: "in-app", openIn: "Safari" },
    ],
  ];
  it.each(cases)("maps %o to %o", (platform, state) => {
    expect(installStep(platform)).toEqual(state);
  });

  it("treats a page already running standalone as done", () => {
    const platform = detectPlatform(
      snapshot(UA.androidChrome, { displayModeStandalone: true }),
    );
    expect(installStep(platform)).toEqual({ kind: "done" });
  });
});

const run = (state: InstallState, ...actions: InstallAction[]) =>
  actions.reduce(installFlow, state);

describe("installFlow on Android Chrome and Edge (ac-1)", () => {
  it("starts waiting for the browser's install prompt", () => {
    expect(
      run(
        { kind: "detecting" },
        {
          type: "detected",
          platform: detectPlatform(snapshot(UA.androidChrome)),
        },
      ),
    ).toEqual({ kind: "waiting" });
  });

  it("turns on the Install button once the prompt arrives", () => {
    expect(run({ kind: "waiting" }, { type: "promptReady" })).toEqual({
      kind: "prompt",
    });
  });

  it("finishes when the person accepts the native dialog", () => {
    expect(run({ kind: "prompt" }, { type: "installed" })).toEqual({
      kind: "done",
    });
  });

  it("ignores a second detection once the flow has started", () => {
    expect(
      run(
        { kind: "prompt" },
        { type: "detected", platform: { kind: "other" } },
      ),
    ).toEqual({ kind: "prompt" });
    expect(
      run(
        { kind: "menu" },
        { type: "detected", platform: { kind: "installed" } },
      ),
    ).toEqual({ kind: "menu" });
  });
});

describe("installFlow fallback to the browser menu (ac-2)", () => {
  it("shows the menu fallback when no prompt arrives, and never skips", () => {
    const state = run({ kind: "waiting" }, { type: "waitedOut" });
    expect(state).toEqual({ kind: "menu" });
    expect(run(state, { type: "waitedOut" })).toEqual({ kind: "menu" });
  });

  it("ignores waitedOut once the prompt has arrived", () => {
    expect(run({ kind: "prompt" }, { type: "waitedOut" })).toEqual({
      kind: "prompt",
    });
  });

  it("shows the menu fallback when the person dismisses the native dialog", () => {
    expect(run({ kind: "prompt" }, { type: "dismissed" })).toEqual({
      kind: "menu",
    });
  });

  it("brings the Install button back if the browser offers the prompt again", () => {
    expect(run({ kind: "menu" }, { type: "promptReady" })).toEqual({
      kind: "prompt",
    });
  });

  it.each<InstallState>([{ kind: "menu" }, { kind: "waiting" }])(
    "finishes from %o when the app is installed from the browser menu",
    (state) => {
      expect(run(state, { type: "installed" })).toEqual({ kind: "done" });
    },
  );

  it("leaves iOS and in-app screens alone when a stray prompt arrives", () => {
    expect(run({ kind: "ios" }, { type: "promptReady" })).toEqual({
      kind: "ios",
    });
    expect(
      run({ kind: "in-app", openIn: "Chrome" }, { type: "promptReady" }),
    ).toEqual({ kind: "in-app", openIn: "Chrome" });
  });
});

const promptEvent = (outcome: "accepted" | "dismissed") =>
  Object.assign(new Event("beforeinstallprompt", { cancelable: true }), {
    prompt: vi.fn(async () => {}),
    userChoice: Promise.resolve({ outcome }),
  });

const setup = () => {
  const target = new EventTarget();
  const dispatch = vi.fn<(action: InstallAction) => void>();
  const watcher = watchInstall(target, dispatch);
  return { target, dispatch, watcher };
};

describe("watchInstall (ac-1, ac-2)", () => {
  it("holds back the browser's own banner and reports the prompt is ready", () => {
    const { target, dispatch } = setup();
    const event = promptEvent("accepted");
    target.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: "promptReady" });
  });

  it("opens the native dialog once and reports an accepted install", async () => {
    const { target, dispatch, watcher } = setup();
    const event = promptEvent("accepted");
    target.dispatchEvent(event);
    dispatch.mockClear();

    await watcher.install();

    expect(event.prompt).toHaveBeenCalledOnce();
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: "installed" });
  });

  it("reports a dismissed dialog", async () => {
    const { target, dispatch, watcher } = setup();
    target.dispatchEvent(promptEvent("dismissed"));
    dispatch.mockClear();

    await watcher.install();

    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: "dismissed" });
  });

  it("does not reopen a prompt that was already used", async () => {
    const { target, dispatch, watcher } = setup();
    const event = promptEvent("dismissed");
    target.dispatchEvent(event);
    await watcher.install();
    dispatch.mockClear();

    await watcher.install();

    expect(event.prompt).toHaveBeenCalledOnce();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("does nothing when no prompt has arrived", async () => {
    const { dispatch, watcher } = setup();
    await watcher.install();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("reports an install made from the browser menu", () => {
    const { target, dispatch } = setup();
    target.dispatchEvent(new Event("appinstalled"));
    expect(dispatch).toHaveBeenCalledExactlyOnceWith({ type: "installed" });
  });

  it("stops listening once stopped", () => {
    const { target, dispatch, watcher } = setup();
    watcher.stop();
    const event = promptEvent("accepted");
    target.dispatchEvent(event);
    target.dispatchEvent(new Event("appinstalled"));
    expect(event.defaultPrevented).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });
});
