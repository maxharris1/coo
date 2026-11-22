"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { topFor, type Top } from "@/components/shell";

const TOKEN: Record<Top, string> = {
  sky: "--coo-sky",
  sun: "--coo-sun",
  tomato: "--coo-tomato",
  map: "--coo-paper",
  paper: "--coo-paper",
};

export function ThemeColor() {
  const path = usePathname();

  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    if (!meta) return;
    meta.content = getComputedStyle(document.documentElement)
      .getPropertyValue(TOKEN[topFor(path)])
      .trim();
  }, [path]);

  return null;
}
