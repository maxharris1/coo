"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { Loader } from "@/components/Loader";
import { useSync } from "@/components/SyncProvider";
import { useToast } from "@/components/Toasts";
import { ConfirmBuy } from "./ConfirmBuy";
import {
  buyItem,
  completeBuy,
  loadShop,
  openShop,
  purchase,
  type ShopRows,
} from "./shop";
import { ShopItems } from "./ShopItems";
import { ShopTop } from "./ShopTop";

export default function ShopPage() {
  const toast = useToast();
  const { refresh } = useSync();
  const [rows, setRows] = useState<ShopRows | null>(null);
  const [state, dispatch] = useReducer(purchase, { kind: "idle" });
  const [burst, setBurst] = useState<string | null>(null);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    void openShop(loadShop, (message) => live.current && toast(message)).then(
      (next) => live.current && next && setRows(next),
    );
    return () => {
      live.current = false;
    };
  }, [toast]);

  useEffect(() => {
    if (!burst) return;
    const timer = setTimeout(() => setBurst(null), 1800);
    return () => clearTimeout(timer);
  }, [burst]);

  const onConfirm = async () => {
    if (state.kind !== "confirming") return;
    dispatch({ type: "confirm" });
    const next = await completeBuy(state.row.itemId, {
      buy: (id) => buyItem(id),
      load: () => loadShop(),
      toast: (message) => live.current && toast(message),
      refresh,
      burst: (id) => live.current && setBurst(id),
    });
    if (!live.current) return;
    dispatch({ type: "settled" });
    if (next) setRows(next);
  };

  if (!rows) return <Loader />;
  return (
    <>
      <ShopTop seeds={rows.seeds} />
      <ShopItems
        gear={rows.gear}
        loft={rows.loft}
        burst={burst}
        onBuy={(row) => dispatch({ type: "tap", row })}
      />
      {state.kind !== "idle" && (
        <ConfirmBuy
          row={state.row}
          busy={state.kind === "buying"}
          onConfirm={() => void onConfirm()}
          onCancel={() => dispatch({ type: "cancel" })}
        />
      )}
    </>
  );
}
