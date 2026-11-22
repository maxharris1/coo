import type { Me } from "@/server/rows";

export type Quiet = Pick<Me["settings"], "quietOn" | "quietStart" | "quietEnd">;

export type Sheet =
  | { kind: "closed" }
  | { kind: "quiet"; draft: Quiet }
  | {
      kind: "name";
      text: string;
      error: string | null;
      pending: symbol | null;
    };

export type SheetAction =
  | { type: "openQuiet"; settings: Me["settings"] }
  | { type: "openName"; name: string }
  | { type: "editQuiet"; change: Partial<Quiet> }
  | { type: "type"; text: string }
  | { type: "submitting"; request: symbol }
  | { type: "failed"; error: string }
  | { type: "answered"; request: symbol; error: string | null }
  | { type: "close" };

export const CLOSED: Sheet = { kind: "closed" };

const NAME_MAX = 30;

export function sheetReducer(state: Sheet, action: SheetAction): Sheet {
  switch (action.type) {
    case "openQuiet": {
      const { quietOn, quietStart, quietEnd } = action.settings;
      return { kind: "quiet", draft: { quietOn, quietStart, quietEnd } };
    }
    case "openName":
      return { kind: "name", text: action.name, error: null, pending: null };
    case "close":
      return CLOSED;
    case "editQuiet":
      return state.kind === "quiet"
        ? { ...state, draft: { ...state.draft, ...action.change } }
        : state;
    case "type":
      return state.kind === "name"
        ? { ...state, text: action.text, error: null }
        : state;
    case "submitting":
      return state.kind === "name"
        ? { ...state, pending: action.request }
        : state;
    case "failed":
      return state.kind === "name" ? { ...state, error: action.error } : state;
    case "answered":
      if (state.kind !== "name" || state.pending !== action.request) {
        return state;
      }
      return action.error
        ? { ...state, error: action.error, pending: null }
        : CLOSED;
  }
}

export function nameProblem(text: string): string | null {
  const length = [...text.trim()].length;
  return length >= 1 && length <= NAME_MAX
    ? null
    : `Use 1 to ${NAME_MAX} characters.`;
}

export async function submitName(
  text: string,
  onRename: (name: string) => Promise<string | null>,
  dispatch: (action: SheetAction) => void,
): Promise<void> {
  const problem = nameProblem(text);
  if (problem) {
    dispatch({ type: "failed", error: problem });
    return;
  }
  const request = Symbol("rename");
  dispatch({ type: "submitting", request });
  const error = await onRename(text.trim());
  dispatch({ type: "answered", request, error });
}
