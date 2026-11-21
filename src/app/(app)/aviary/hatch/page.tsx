"use client";

import { useReducer } from "react";
import { useToast } from "@/components/Toasts";
import { hatch, initialHatch, sendHatch } from "./hatch";
import { HatchView } from "./HatchView";

export default function HatchPage() {
  const [state, dispatch] = useReducer(hatch, initialHatch);
  const toast = useToast();

  return (
    <HatchView
      state={state}
      dispatch={dispatch}
      onSubmit={() => void sendHatch(state, dispatch, toast)}
    />
  );
}
