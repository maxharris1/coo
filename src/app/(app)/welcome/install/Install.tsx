"use client";

import {
  type KeyboardEvent,
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { config } from "@/lib/config";
import { detectPlatform } from "@/lib/platform";
import { welcomeStep } from "../steps";
import {
  FALLBACK_MS,
  installFlow,
  watchInstall,
  type InstallState,
} from "./installFlow";
import sheet from "./InstallSheet.module.css";
import styles from "./page.module.css";

const STEP = welcomeStep("/welcome/install");
const NEXT_STEP = STEP.next;
const HOP = { animation: "coo-hop 2.6s ease-in-out infinite" };
const POINT = { animation: "coo-point 0.6s ease-in-out infinite alternate" };
const FADED_LABEL_WIDTHS = [34, 40, 30, 38, 36, null, 32, 40];

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
    text: "Tap Share. If you don't see it, tap ••• first. Share is at the bottom in portrait and at the top right in landscape.",
    icon: (
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={styles.point}
        style={POINT}
      >
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
    text: "Choose Add to Home Screen. Tap View More or scroll if it's hidden.",
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
    text: "Leave Open as Web App on, then tap Add.",
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" aria-hidden="true">
        <rect
          x="2"
          y="7"
          width="20"
          height="10"
          rx="5"
          fill="#7FD6B6"
          stroke="#2A2140"
          strokeWidth="2.2"
        />
        <circle cx="17" cy="12" r="3" fill="#2A2140" />
      </svg>
    ),
  },
];

const focusOnMount = (el: HTMLElement | null) => el?.focus();
const FOCUSABLE = "button, a[href], [tabindex]:not([tabindex='-1'])";

export function InstallView({
  state,
  copied,
  onInstall,
  onCopy,
  onOpenSheet,
  onCloseSheet,
}: {
  state: InstallState;
  copied: boolean;
  onInstall: () => void;
  onCopy: () => void;
  onOpenSheet: () => void;
  onCloseSheet: () => void;
}) {
  const titleId = useId();
  const install = useRef<HTMLButtonElement>(null);
  const sheetOpen = state.kind === "ios" && state.sheet === "open";

  const closeSheet = () => {
    flushSync(onCloseSheet);
    install.current?.focus();
  };

  const onSheetKey = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeSheet();
    } else if (e.key === "Tab") {
      e.preventDefault();
      const items = [
        ...e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE),
      ];
      const at = items.indexOf(e.target as HTMLElement);
      items
        .at(e.shiftKey ? Math.max(at, 0) - 1 : (at + 1) % items.length)
        ?.focus();
    }
  };

  return (
    <>
      <main className={styles.page} inert={sheetOpen}>
        <p className={styles.pill}>{`Step ${STEP.number} of ${STEP.total}`}</p>
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
        {state.kind === "ios" && (
          <button
            ref={install}
            type="button"
            className={styles.action}
            onClick={onOpenSheet}
          >
            Install
          </button>
        )}
        {state.kind === "prompt" && (
          <button type="button" className={styles.action} onClick={onInstall}>
            Install
          </button>
        )}
        {state.kind === "menu" && (
          <p className={styles.openIn}>
            Tap your browser&apos;s menu, then Install app
          </p>
        )}
        {state.kind === "in-app" && (
          <div className={styles.inApp}>
            <p className={styles.openIn}>Open this in {state.openIn} first</p>
            <button type="button" className={styles.copy} onClick={onCopy}>
              {copied ? "Link copied" : "Copy link"}
            </button>
          </div>
        )}
        <Link href={NEXT_STEP} className={styles.skip}>
          Not now. Text me when birds land instead.
        </Link>
      </main>
      {sheetOpen && (
        <div className={sheet.layer} onKeyDown={onSheetKey}>
          <button
            type="button"
            aria-label="Close"
            tabIndex={-1}
            className={sheet.scrim}
            onClick={closeSheet}
          />
          <div
            ref={focusOnMount}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className={sheet.sheet}
          >
            <span aria-hidden="true" className={sheet.grab} />
            <h2 id={titleId} className={sheet.title}>
              Add {config.app.name} to your home screen
            </h2>
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
            <button type="button" className={sheet.close} onClick={closeSheet}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function snapshot() {
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    userAgent: nav.userAgent,
    displayModeStandalone: window.matchMedia("(display-mode: standalone)")
      .matches,
    navigatorStandalone: nav.standalone === true,
    hasInstallPrompt: false,
    maxTouchPoints: nav.maxTouchPoints,
  };
}

export function Install() {
  const router = useRouter();
  const [state, dispatch] = useReducer(installFlow, { kind: "detecting" });
  const [copied, setCopied] = useState(false);
  const watcher = useRef<ReturnType<typeof watchInstall>>(null);

  useEffect(() => {
    watcher.current = watchInstall(window, dispatch);
    dispatch({ type: "detected", platform: detectPlatform(snapshot()) });
    return watcher.current.stop;
  }, []);

  useEffect(() => {
    if (state.kind === "skip" || state.kind === "done") {
      router.replace(NEXT_STEP);
    } else if (state.kind === "waiting") {
      const timer = setTimeout(
        () => dispatch({ type: "waitedOut" }),
        FALLBACK_MS,
      );
      return () => clearTimeout(timer);
    }
  }, [state.kind, router]);

  const onCopy = async () => {
    await navigator.clipboard.writeText(window.location.href);
    setCopied(true);
  };

  return (
    <InstallView
      state={state}
      copied={copied}
      onInstall={() => void watcher.current?.install()}
      onCopy={() => void onCopy()}
      onOpenSheet={() => dispatch({ type: "openSheet" })}
      onCloseSheet={() => dispatch({ type: "closeSheet" })}
    />
  );
}
