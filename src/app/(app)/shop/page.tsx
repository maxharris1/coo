"use client";

import { useEffect, useState } from "react";
import { Loader } from "@/components/Loader";
import { useToast } from "@/components/Toasts";
import { loadShop, openShop, type ShopRows } from "./shop";
import { ShopTop } from "./ShopTop";

export default function ShopPage() {
  const toast = useToast();
  const [rows, setRows] = useState<ShopRows | null>(null);

  useEffect(() => {
    let live = true;
    void openShop(loadShop, (message) => live && toast(message)).then(
      (next) => live && next && setRows(next),
    );
    return () => {
      live = false;
    };
  }, [toast]);

  if (!rows) return <Loader />;
  return <ShopTop seeds={rows.seeds} />;
}
