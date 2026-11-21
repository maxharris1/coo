import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { readAppEnv } from "@/env";

export default function DevLayout({ children }: { children: ReactNode }) {
  const appEnv = readAppEnv(process.env);
  if (!appEnv || appEnv === "production") notFound();
  return <>{children}</>;
}
