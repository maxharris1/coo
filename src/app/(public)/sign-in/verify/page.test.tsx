import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { describe, expect, it } from "vitest";
import type { E164 } from "@/lib/phone";
import { WRONG_CODE } from "@/server/auth";
import SignInLayout from "../layout";
import { SignInPhoneContext } from "../phone";
import { code, initialCode, RESEND_AFTER_MS, type CodeState } from "./code";
import { CodeForm } from "./CodeForm";
import CodePage from "./page";

const router = {} as React.ContextType<typeof AppRouterContext>;
const render = (node: ReactNode, phone: E164 | null = null) =>
  renderToStaticMarkup(
    <AppRouterContext.Provider value={router}>
      <SignInPhoneContext.Provider value={{ phone, setPhone: () => {} }}>
        {node}
      </SignInPhoneContext.Provider>
    </AppRouterContext.Provider>,
  ).replaceAll("&#x27;", "'");

const wrong = (sentAt: number): CodeState =>
  code(initialCode(sentAt), { type: "failed", message: WRONG_CODE });

const inputs = (html: string) => html.match(/<input[^>]*\/>/g) ?? [];

describe("/sign-in/verify (Code)", () => {
  it("renders the page inside the sign-in layout", () => {
    const html = renderToStaticMarkup(
      <AppRouterContext.Provider value={router}>
        <SignInLayout>
          <CodePage />
        </SignInLayout>
      </AppRouterContext.Provider>,
    );
    expect(html).toMatch(/<h1[^>]*>/);
    expect(inputs(html)).toHaveLength(6);
  });

  it("shows six labelled one-time-code boxes", () => {
    const html = render(<CodeForm initial={initialCode(Date.now())} />);
    const boxes = inputs(html);
    expect(boxes).toHaveLength(6);
    for (const box of boxes) {
      expect(box).toContain('inputMode="numeric"');
      expect(box).toContain('autoComplete="one-time-code"');
      const id = box.match(/id="([^"]+)"/)?.[1];
      expect(id, box).toBeTruthy();
      expect(html).toMatch(new RegExp(`<label for="${id}"[^>]*>[^<]+<`));
    }
  });

  it("shows the wrong-code line in an aria-live line", () => {
    const html = render(<CodeForm initial={wrong(Date.now())} />);
    expect(html).toMatch(
      /<[a-z]+[^>]*aria-live="[a-z]+"[^>]*>That's not it\. Try once more\.</,
    );
    expect(inputs(html)).toHaveLength(6);
  });

  it("keeps an empty aria-live line before any wrong code", () => {
    const html = render(<CodeForm initial={initialCode(Date.now())} />);
    expect(html).toMatch(/aria-live="[a-z]+"/);
    expect(html).not.toContain(WRONG_CODE);
  });

  it("hides Send it again before 30 s", () => {
    const html = render(
      <CodeForm initial={wrong(Date.now() - RESEND_AFTER_MS + 1_000)} />,
      "+15555550100" as E164,
    );
    expect(html).not.toContain("Send it again");
  });

  it("offers Send it again as a button for the remembered number after 30 s", () => {
    const html = render(
      <CodeForm initial={wrong(Date.now() - RESEND_AFTER_MS)} />,
      "+15555550100" as E164,
    );
    expect(html).toMatch(
      /<button[^>]*type="button"[^>]*>Send it again<\/button>/,
    );
  });

  it("links Send it again to /sign-in when no number is remembered", () => {
    const html = render(
      <CodeForm initial={wrong(Date.now() - RESEND_AFTER_MS)} />,
      null,
    );
    expect(html).toMatch(/<a[^>]*href="\/sign-in"[^>]*>Send it again<\/a>/);
  });

  it("keeps the number out of URLs and web storage", () => {
    for (const file of ["./page.tsx", "./CodeForm.tsx"]) {
      const src = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(src, file).not.toMatch(
        /localStorage|sessionStorage|searchParams|URLSearchParams|\?phone/,
      );
    }
  });
});
