import type { ReactElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GetAPigeon } from "./GetAPigeon";

const CODE = "priya-AbCdEfGhIj_-";

describe("Get a pigeon", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("sends the visitor to sign-in and remembers the invite", () => {
    const document = { cookie: "" };
    vi.stubGlobal("document", document);
    vi.stubGlobal("location", { protocol: "http:" });
    const link = GetAPigeon({ code: CODE }) as ReactElement<{
      href: string;
      onClick: () => void;
    }>;
    expect(link.props.href).toBe("/sign-in");
    link.props.onClick();
    expect(document.cookie).toMatch(new RegExp(`^coo_return=${CODE};`));
  });
});
