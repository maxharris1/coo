"use client";

import { createContext, useContext } from "react";
import type { E164 } from "@/lib/phone";

export type SignInPhone = {
  phone: E164 | null;
  setPhone: (phone: E164) => void;
};

export const SignInPhoneContext = createContext<SignInPhone | null>(null);

export function useSignInPhone(): SignInPhone {
  const value = useContext(SignInPhoneContext);
  if (!value) throw new Error("useSignInPhone needs sign-in/layout.tsx");
  return value;
}
