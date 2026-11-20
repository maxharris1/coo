import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { describe, expect, it } from "vitest";
import SignInLayout from "./layout";
import PhonePage from "./page";

const router = {} as React.ContextType<typeof AppRouterContext>;
const html = renderToStaticMarkup(
  <AppRouterContext.Provider value={router}>
    <SignInLayout>
      <PhonePage />
    </SignInLayout>
  </AppRouterContext.Provider>,
).replaceAll("&#x27;", "'");
const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

describe("/sign-in (Phone)", () => {
  it("shows the docs/07 copy", () => {
    expect(html).toMatch(/<h1[^>]*>What's your number\?<\/h1>/);
    expect(html).toContain("We text you a code. That's the whole password.");
    expect(html).toMatch(
      /<button[^>]*type="submit"[^>]*>Text me the code<\/button>/,
    );
  });

  it("labels a tel input with +1 as the default country", () => {
    const input = (id: string) =>
      html.match(new RegExp(`<input[^>]*id="${id}"[^>]*/>`))?.[0] ?? "";
    expect(html).toContain('<label for="sign-in-phone"');
    expect(html).toMatch(/<label for="sign-in-phone"[^>]*>Phone number</);
    expect(input("sign-in-phone")).toContain('type="tel"');
    expect(input("sign-in-phone")).toContain('autoComplete="tel-national"');
    expect(html).toMatch(/<label for="sign-in-country"[^>]*>Country code</);
    expect(input("sign-in-country")).toContain('value="+1"');
  });

  it("keeps the number out of URLs and web storage", () => {
    for (const file of [
      "./page.tsx",
      "./PhoneForm.tsx",
      "./layout.tsx",
      "./phone.tsx",
      "./postAuth.ts",
    ]) {
      const src = read(file);
      expect(src, file).not.toMatch(
        /localStorage|sessionStorage|searchParams|URLSearchParams|\?phone/,
      );
    }
    expect(html).not.toMatch(/<form[^>]*(action|method)=/);
  });
});
