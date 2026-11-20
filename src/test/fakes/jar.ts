import type { SessionJar, JarEntry } from "@/server/ports/auth";

export class FakeJar implements SessionJar {
  readonly cookies = new Map<string, JarEntry>();
  headers: Record<string, string> = {};

  getAll() {
    return [...this.cookies.values()].map(({ name, value }) => ({
      name,
      value,
    }));
  }

  setAll(cookies: JarEntry[], headers: Record<string, string> = {}) {
    Object.assign(this.headers, headers);
    for (const cookie of cookies) {
      if (cookie.value === "" || cookie.options.maxAge === 0) {
        this.cookies.delete(cookie.name);
      } else {
        this.cookies.set(cookie.name, cookie);
      }
    }
  }
}
