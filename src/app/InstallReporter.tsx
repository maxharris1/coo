"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { createInstallReporter } from "./reportInstalled";

const reportInstalled = createInstallReporter();

export function InstallReporter() {
  const pathname = usePathname();
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    void reportInstalled(standalone);
  }, [pathname]);
  return null;
}
