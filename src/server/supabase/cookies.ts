import type { CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import type { JarEntry, JarOptions, SessionJar } from "../ports/auth";

export function toJarOptions(options: CookieOptions): JarOptions {
  const { httpOnly, secure, sameSite, path, maxAge } = options;
  const picked: JarOptions = { httpOnly, secure, path, maxAge };
  if (sameSite === true) picked.sameSite = "strict";
  else if (sameSite) picked.sameSite = sameSite;
  return Object.fromEntries(
    Object.entries(picked).filter(([, value]) => value !== undefined),
  );
}

export function requestJar(req: NextRequest): {
  jar: SessionJar;
  commit(res: NextResponse): NextResponse;
} {
  const pending = new Map<string, JarEntry>();
  const headers: Record<string, string> = {};
  return {
    jar: {
      getAll: () => req.cookies.getAll(),
      setAll(entries, extra = {}) {
        for (const entry of entries) {
          req.cookies.set(entry.name, entry.value);
          pending.set(entry.name, entry);
        }
        Object.assign(headers, extra);
      },
    },
    commit(res) {
      for (const { name, value, options } of pending.values()) {
        res.cookies.set(name, value, options);
      }
      for (const [key, value] of Object.entries(headers)) {
        res.headers.set(key, value);
      }
      return res;
    },
  };
}

export async function headersJar(): Promise<SessionJar> {
  const store = await cookies();
  return {
    getAll: () => store.getAll(),
    setAll(entries) {
      try {
        for (const { name, value, options } of entries) {
          store.set(name, value, options);
        }
      } catch {
        // Server components cannot set cookies; the proxy's requestJar already wrote the refresh.
      }
    },
  };
}
