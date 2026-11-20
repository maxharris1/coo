import type { E164 } from "@/lib/phone";

export type UserId = string & { readonly __brand: "UserId" };

export type JarOptions = {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "lax" | "strict" | "none";
  path?: string;
  maxAge?: number;
};

export type JarEntry = {
  name: string;
  value: string;
  options: JarOptions;
};

export interface SessionJar {
  getAll(): { name: string; value: string }[];
  setAll(cookies: JarEntry[], headers?: Record<string, string>): void;
}

export interface AuthPort {
  sendCode(phone: E164): Promise<void>;
  verifyCode(phone: E164, code: string): Promise<UserId | null>;
  currentUserId(): Promise<UserId | null>;
  signOut(): Promise<void>;
}
