"use client";

import { useRouter } from "next/navigation";
import { useReducer, useState } from "react";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { useToast } from "@/components/Toasts";
import type { SyncPayload } from "@/components/sync";
import { initialRoommate, roommate, sendRoommate } from "./roommate";
import { RoommateView } from "./RoommateView";

const flockSignal = (data: SyncPayload): string =>
  JSON.stringify([data.me.perches, data.birds.map((b) => [b.name, b.look])]);

function Roommate({ data }: { data: SyncPayload }) {
  const [state, dispatch] = useReducer(roommate, undefined, () =>
    initialRoommate(data.birds, data.me.perches),
  );
  const signal = flockSignal(data);
  const [seen, setSeen] = useState(signal);
  const sending = state.kind === "naming" && state.sending;
  if (signal !== seen && !sending) {
    setSeen(signal);
    dispatch({ type: "sync", flock: data.birds, perches: data.me.perches });
  }
  const { refresh } = useSync();
  const router = useRouter();
  const toast = useToast();

  const onAdopted = () => {
    refresh();
    router.push("/");
  };

  return (
    <RoommateView
      state={state}
      dispatch={dispatch}
      onSubmit={() => void sendRoommate(state, dispatch, toast, onAdopted)}
    />
  );
}

export default function RoommatePage() {
  const { data } = useSync();
  return data ? <Roommate data={data} /> : <Loader />;
}
