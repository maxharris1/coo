"use client";

import { useState, type ReactNode } from "react";
import type { E164 } from "@/lib/phone";
import { pendingLink } from "../b/[slug]/linkSignUp";
import { SignInPhoneContext } from "./phone";

export default function SignInLayout({ children }: { children: ReactNode }) {
  const [phone, setPhone] = useState<E164 | null>(
    () => pendingLink()?.phone ?? null,
  );
  return (
    <SignInPhoneContext.Provider value={{ phone, setPhone }}>
      {children}
    </SignInPhoneContext.Provider>
  );
}
