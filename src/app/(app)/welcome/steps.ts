export const WELCOME_STEPS = [
  "/welcome/bird",
  "/welcome/install",
  "/welcome/loft",
] as const;

export type WelcomeStep = (typeof WELCOME_STEPS)[number];

type LastStep = typeof WELCOME_STEPS extends readonly [...unknown[], infer L]
  ? L
  : never;

type Position<Next> = { number: number; total: number; next: Next };

export function welcomeStep(path: LastStep): Position<null>;
export function welcomeStep(
  path: Exclude<WelcomeStep, LastStep>,
): Position<WelcomeStep>;
export function welcomeStep(path: WelcomeStep): Position<WelcomeStep | null> {
  const at = WELCOME_STEPS.indexOf(path);
  return {
    number: at + 1,
    total: WELCOME_STEPS.length,
    next: WELCOME_STEPS[at + 1] ?? null,
  };
}
