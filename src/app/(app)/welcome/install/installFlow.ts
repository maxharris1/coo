import type { Platform } from "@/lib/platform";

export const FALLBACK_MS = 2500;

export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallState =
  | { kind: "detecting" }
  | { kind: "waiting" }
  | { kind: "prompt" }
  | { kind: "menu" }
  | { kind: "ios"; sheet: "open" | "closed" }
  | { kind: "in-app"; openIn: "Safari" | "Chrome" }
  | { kind: "skip" }
  | { kind: "done" };

export type InstallAction =
  | { type: "detected"; platform: Platform }
  | { type: "promptReady" }
  | { type: "waitedOut" }
  | { type: "dismissed" }
  | { type: "installed" }
  | { type: "openSheet" }
  | { type: "closeSheet" };

export function installStep(platform: Platform): InstallState {
  switch (platform.kind) {
    case "installed":
      return { kind: "done" };
    case "other":
      return { kind: "skip" };
    case "ios-safari":
      return { kind: "ios", sheet: "closed" };
    case "prompt":
      return { kind: "prompt" };
    case "prompt-pending":
      return { kind: "waiting" };
    case "in-app":
      return { kind: "in-app", openIn: platform.openIn };
  }
}

export function installFlow(
  state: InstallState,
  action: InstallAction,
): InstallState {
  switch (action.type) {
    case "detected":
      return state.kind === "detecting" ? installStep(action.platform) : state;
    case "promptReady":
      return state.kind === "waiting" || state.kind === "menu"
        ? { kind: "prompt" }
        : state;
    case "waitedOut":
      return state.kind === "waiting" ? { kind: "menu" } : state;
    case "dismissed":
      return state.kind === "prompt" ? { kind: "menu" } : state;
    case "installed":
      return { kind: "done" };
    case "openSheet":
      return state.kind === "ios" ? { kind: "ios", sheet: "open" } : state;
    case "closeSheet":
      return state.kind === "ios" ? { kind: "ios", sheet: "closed" } : state;
  }
}

export function watchInstall(
  target: EventTarget,
  dispatch: (action: InstallAction) => void,
) {
  let pending: BeforeInstallPromptEvent | null = null;
  const onPrompt = (event: Event) => {
    event.preventDefault();
    pending = event as BeforeInstallPromptEvent;
    dispatch({ type: "promptReady" });
  };
  const onInstalled = () => dispatch({ type: "installed" });
  target.addEventListener("beforeinstallprompt", onPrompt);
  target.addEventListener("appinstalled", onInstalled);

  return {
    async install() {
      const event = pending;
      if (!event) return;
      pending = null;
      await event.prompt();
      const { outcome } = await event.userChoice;
      dispatch({ type: outcome === "accepted" ? "installed" : "dismissed" });
    },
    stop() {
      target.removeEventListener("beforeinstallprompt", onPrompt);
      target.removeEventListener("appinstalled", onInstalled);
    },
  };
}
