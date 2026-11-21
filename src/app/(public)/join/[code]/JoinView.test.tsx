import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { JoinView } from "./JoinView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

const render = (signedIn: boolean) =>
  renderToStaticMarkup(
    <JoinView name="Priya" code="priya-AAAA" signedIn={signedIn} />,
  ).replaceAll("&#x27;", "'");

describe("/join/[code]", () => {
  it("says who sent the invite", () => {
    for (const signedIn of [true, false]) {
      expect(render(signedIn)).toContain(
        "Priya wants to trade pigeons with you.",
      );
    }
  });

  it("offers a signed-in visitor a button to add the inviter", () => {
    const html = render(true);
    expect(html).toMatch(/<button[^>]*type="button"[^>]*>Add Priya<\/button>/);
    expect(html).not.toContain("Get a pigeon");
  });

  it("sends a signed-out visitor to sign-in", () => {
    const html = render(false);
    expect(html).toMatch(/<a[^>]*href="\/sign-in"[^>]*>Get a pigeon<\/a>/);
    expect(html).not.toContain("Add Priya");
  });

  it("styles with tokens only", () => {
    for (const file of ["./JoinView.tsx", "./AddFriend.tsx"]) {
      expect(
        readFileSync(new URL(file, import.meta.url), "utf8"),
      ).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    }
  });
});
