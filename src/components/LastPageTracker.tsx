"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { rememberPage } from "./lastPage";

export function LastPageTracker() {
  const pathname = usePathname();
  useEffect(() => {
    try {
      rememberPage(pathname, window.sessionStorage);
    } catch {
      return;
    }
  }, [pathname]);
  return null;
}
