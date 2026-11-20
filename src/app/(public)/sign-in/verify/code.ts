export const CODE_LENGTH = 6;

export const RESEND_AFTER_MS = 30_000;

export type CodeState = {
  digits: readonly string[];
  phase: "typing" | "checking";
  message: string | null;
  resendAt: number;
};

export type CodeAction =
  | { type: "typed"; index: number; text: string }
  | { type: "erased"; index: number }
  | { type: "checking" }
  | { type: "failed"; message: string }
  | { type: "resent"; now: number };

const EMPTY: readonly string[] = Array<string>(CODE_LENGTH).fill("");

export const initialCode = (sentAt: number): CodeState => ({
  digits: EMPTY,
  phase: "typing",
  message: null,
  resendAt: sentAt + RESEND_AFTER_MS,
});

export function code(state: CodeState, action: CodeAction): CodeState {
  switch (action.type) {
    case "typed": {
      const typed = action.text.replace(/\D/g, "");
      if (state.phase === "checking" || typed === "") return state;
      const digits = state.digits.map(
        (d, i) => typed.charAt(i - action.index) || d,
      );
      return { ...state, digits };
    }
    case "erased": {
      if (state.phase === "checking") return state;
      const digits = state.digits.map((d, i) => (i === action.index ? "" : d));
      return { ...state, digits };
    }
    case "checking":
      return { ...state, phase: "checking", message: null };
    case "failed":
      return {
        ...state,
        digits: EMPTY,
        phase: "typing",
        message: action.message,
      };
    case "resent":
      return {
        digits: EMPTY,
        phase: "typing",
        message: null,
        resendAt: action.now + RESEND_AFTER_MS,
      };
  }
}

export const isComplete = (state: CodeState) =>
  state.phase === "typing" && state.digits.every((d) => d !== "");

export const canResend = (state: CodeState, now: number) =>
  now >= state.resendAt;
