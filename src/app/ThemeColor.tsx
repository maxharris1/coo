"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { canvasFor, topFor, type Top } from "@/components/shell";

const TOKEN: Record<Exclude<Top, "map">, string> = {
  sky: "--coo-sky",
  sun: "--coo-sun",
  tomato: "--coo-tomato",
  paper: "--coo-paper",
};

const TRACKER_DAY = "#d4ebb0";

function colourFor(top: Top): string {
  return top === "map"
    ? TRACKER_DAY
    : getComputedStyle(document.documentElement)
        .getPropertyValue(TOKEN[top])
        .trim();
}

export function ThemeColor() {
  const path = usePathname();

  useEffect(() => {
    document.documentElement.dataset.canvas = canvasFor(path);
    const colour = colourFor(topFor(path));
    const paint = () => {
      for (const meta of document.querySelectorAll<HTMLMetaElement>(
        'meta[name="theme-color"]',
      )) {
        if (meta.content !== colour) meta.content = colour;
      }
    };
    paint();
    const observer = new MutationObserver(paint);
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["content"],
    });
    return () => observer.disconnect();
  }, [path]);

  return null;
}
