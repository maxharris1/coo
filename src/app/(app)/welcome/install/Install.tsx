"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { config } from "@/lib/config";
import { detectPlatform, type Platform } from "@/lib/platform";
import styles from "./page.module.css";

const NEXT_STEP = "/welcome/bird";
const PROMPT_WAIT_MS = 3000;
const HOP = { animation: "coo-hop 2.6s ease-in-out infinite" };
const POINT = { animation: "coo-point 0.6s ease-in-out infinite alternate" };
const FADED_LABEL_WIDTHS = [34, 40, 30, 38, 36, null, 32, 40];

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallScreen =
  | { kind: "detecting" }
  | { kind: "ios" }
  | { kind: "prompt" }
  | { kind: "in-app"; openIn: "Safari" | "Chrome" };

export type InstallStep =
  | Exclude<InstallScreen, { kind: "detecting" }>
  | { kind: "skip" }
  | { kind: "wait" };

export function installStep(platform: Platform): InstallStep {
  switch (platform.kind) {
    case "installed":
    case "other":
      return { kind: "skip" };
    case "ios-safari":
      return { kind: "ios" };
    case "prompt":
      return { kind: "prompt" };
    case "prompt-pending":
      return { kind: "wait" };
    case "in-app":
      return { kind: "in-app", openIn: platform.openIn };
  }
}

function AppIcon() {
  return (
    <svg width="62" height="62" viewBox="0 0 62 62" aria-hidden="true">
      <rect
        x="1.5"
        y="1.5"
        width="59"
        height="59"
        rx="15"
        fill="#FFC93C"
        stroke="#2A2140"
        strokeWidth="3"
      />
      <g transform="translate(-52 -8) scale(.94)">
        <ellipse
          cx="80"
          cy="62"
          rx="17"
          ry="8"
          fill="#7FD6B6"
          stroke="#2A2140"
          strokeWidth="2.8"
        />
        <circle
          cx="84"
          cy="40"
          r="19"
          fill="#B8B3D6"
          stroke="#2A2140"
          strokeWidth="3"
        />
        <circle
          cx="90"
          cy="36"
          r="7"
          fill="#FFB03A"
          stroke="#2A2140"
          strokeWidth="2.6"
        />
        <circle cx="91.6" cy="36" r="2.8" fill="#2A2140" />
        <path
          d="M101 36 L115 41 L101 46 Z"
          fill="#F4623F"
          stroke="#2A2140"
          strokeWidth="2.6"
          strokeLinejoin="round"
        />
      </g>
    </svg>
  );
}

function HomeScreen() {
  return (
    <div
      role="img"
      aria-label={`The ${config.app.name} icon sitting on a phone home screen among other apps`}
      className={styles.homeScreen}
    >
      {FADED_LABEL_WIDTHS.map((width, i) =>
        width === null ? (
          <div key={i} className={`${styles.app} ${styles.hop}`} style={HOP}>
            <AppIcon />
            <div className={styles.appName}>{config.app.name}</div>
          </div>
        ) : (
          <div key={i} className={styles.fadedApp}>
            <div className={styles.fadedIcon} />
            <div className={styles.fadedLabel} style={{ width }} />
          </div>
        ),
      )}
    </div>
  );
}

const STEPS = [
  {
    text: "Tap Share in your browser's toolbar",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M8 10 H6 V21 H18 V10 H16 M12 15 V3 M8 7 L12 3 L16 7"
          fill="none"
          stroke="#2A2140"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    ),
  },
  {
    text: "Choose Add to Home Screen",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
        <rect
          x="4"
          y="4"
          width="16"
          height="16"
          rx="4"
          fill="none"
          stroke="#2A2140"
          strokeWidth="2.2"
        />
        <path
          d="M12 8 V16 M8 12 H16"
          stroke="#2A2140"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
  {
    text: `Open ${config.app.name} from the new icon and say yes to notifications`,
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
        <path
          d="M12 4 Q18 5 18 13 L20 17 H4 L6 13 Q6 5 12 4 Z"
          fill="none"
          stroke="#2A2140"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path
          d="M10 20 Q12 22 14 20"
          fill="none"
          stroke="#2A2140"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    ),
  },
];

function IosSteps() {
  return (
    <ol className={styles.steps}>
      {STEPS.map((step, i) => (
        <li key={step.text} className={styles.step}>
          <div aria-hidden="true" className={styles.stepNumber}>
            {i + 1}
          </div>
          <div className={styles.stepText}>{step.text}</div>
          {step.icon}
        </li>
      ))}
    </ol>
  );
}

function SharePointer() {
  return (
    <div className={styles.pointer}>
      <div className={styles.pointerLabel}>Share is down here</div>
      <svg
        width="34"
        height="34"
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={styles.point}
        style={POINT}
      >
        <path
          d="M12 3 V19 M5 13 L12 20 L19 13"
          fill="none"
          stroke="#2A2140"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export function InstallView({
  screen,
  copied,
  onInstall,
  onCopy,
}: {
  screen: InstallScreen;
  copied: boolean;
  onInstall: () => void;
  onCopy: () => void;
}) {
  return (
    <main className={styles.page}>
      <p className={styles.pill}>Step 1 of 3</p>
      <div className={styles.intro}>
        <h1 className={styles.title}>
          Put {config.app.name} on your home screen
        </h1>
        <p className={styles.subline}>
          It opens full screen like any other app, and it is how your phone
          tells you a bird has landed.
        </p>
      </div>
      <HomeScreen />
      {screen.kind === "ios" && <IosSteps />}
      {screen.kind === "prompt" && (
        <button type="button" className={styles.action} onClick={onInstall}>
          Install
        </button>
      )}
      {screen.kind === "in-app" && (
        <div className={styles.inApp}>
          <p className={styles.openIn}>Open this in {screen.openIn} first</p>
          <button type="button" className={styles.copy} onClick={onCopy}>
            {copied ? "Link copied" : "Copy link"}
          </button>
        </div>
      )}
      <Link href={NEXT_STEP} className={styles.skip}>
        Not now. Text me when birds land instead.
      </Link>
      {screen.kind === "ios" && <SharePointer />}
    </main>
  );
}

function snapshot(hasInstallPrompt: boolean) {
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    userAgent: nav.userAgent,
    displayModeStandalone: window.matchMedia("(display-mode: standalone)")
      .matches,
    navigatorStandalone: nav.standalone === true,
    hasInstallPrompt,
    maxTouchPoints: nav.maxTouchPoints,
  };
}

export function Install() {
  const router = useRouter();
  const [screen, setScreen] = useState<InstallScreen>({ kind: "detecting" });
  const [copied, setCopied] = useState(false);
  const installPrompt = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    let waiting: ReturnType<typeof setTimeout> | undefined;
    const evaluate = () => {
      const step = installStep(
        detectPlatform(snapshot(installPrompt.current !== null)),
      );
      if (step.kind === "skip") {
        router.replace(NEXT_STEP);
      } else if (step.kind === "wait") {
        waiting ??= setTimeout(() => router.replace(NEXT_STEP), PROMPT_WAIT_MS);
      } else {
        clearTimeout(waiting);
        setScreen(step);
      }
    };
    const onPrompt = (event: Event) => {
      event.preventDefault();
      installPrompt.current = event as BeforeInstallPromptEvent;
      evaluate();
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    evaluate();
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      clearTimeout(waiting);
    };
  }, [router]);

  const onInstall = async () => {
    const event = installPrompt.current;
    if (!event) return;
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") router.replace(NEXT_STEP);
  };

  const onCopy = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
  };

  return (
    <InstallView
      screen={screen}
      copied={copied}
      onInstall={() => void onInstall()}
      onCopy={() => void onCopy()}
    />
  );
}
