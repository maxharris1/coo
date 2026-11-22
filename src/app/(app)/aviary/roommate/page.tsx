"use client";

import { useRouter } from "next/navigation";
import { useReducer } from "react";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { useToast } from "@/components/Toasts";
import type { SyncPayload } from "@/components/sync";
import { initialRoommate, roommate, sendRoommate } from "./roommate";
import { RoommateView } from "./RoommateView";

function Roommate({ data }: { data: SyncPayload }) {
  const [state, dispatch] = useReducer(roommate, undefined, () =>
    initialRoommate(data.birds, data.me.perches),
  );
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
