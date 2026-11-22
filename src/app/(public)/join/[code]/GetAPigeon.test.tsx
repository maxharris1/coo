import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { E164 } from "@/lib/phone";
import { pendingLink, rememberLink } from "../../b/[slug]/linkSignUp";
import { GetAPigeon } from "./GetAPigeon";

const CODE = "priya-AbCdEfGhIj_-";

describe("Get a pigeon", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the visitor to sign-in, remembers the invite and drops an abandoned guest signup", () => {
    const document = { cookie: "" };
    const session = new Map<string, string>();
    vi.stubGlobal("document", document);
    vi.stubGlobal("location", { protocol: "http:" });
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => session.get(k) ?? null,
      setItem: (k: string, v: string) => session.set(k, v),
      removeItem: (k: string) => session.delete(k),
    });
    rememberLink({
      token: "AbCdEfGhIjKl",
      name: "Maya",
      phone: "+15550100199" as E164,
    });
    const link = GetAPigeon({ code: CODE }) as ReactElement<{
      href: string;
      onClick: () => void;
    }>;
    expect(link.props.href).toBe("/sign-in");
    link.props.onClick();
    expect(document.cookie).toMatch(new RegExp(`^coo_return=${CODE};`));
    expect(pendingLink()).toBeNull();
  });
});
