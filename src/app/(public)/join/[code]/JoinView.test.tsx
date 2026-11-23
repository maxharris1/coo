import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { JoinView } from "./JoinView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => {} }) }));

const render = (signedIn: boolean, name = "Priya") =>
  renderToStaticMarkup(
    <JoinView name={name} code="priya-AAAA" signedIn={signedIn} />,
  ).replaceAll("&#x27;", "'");

const SUBHEAD = "Keep a pigeon and send notes, at pigeon speed.";

describe("/join/[code]", () => {
  it("says who sent the invite", () => {
    for (const signedIn of [true, false]) {
      const html = render(signedIn);
      expect(html).toContain(">Priya saved you a perch.</h1>");
      expect(html).toContain(SUBHEAD);
      expect(html).not.toMatch(/trade/i);
    }
  });

  it("falls back to a friend when the inviter has no name", () => {
    const html = render(true, "  ");
    expect(html).toContain("A friend saved you a perch.");
    expect(html).toContain(">Add friend</button>");
    for (const broken of [">Add <", "> saved", " wants to", "someone wants"]) {
      expect(html).not.toContain(broken);
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
    for (const file of [
      "./JoinView.tsx",
      "./AddFriend.tsx",
      "./GetAPigeon.tsx",
    ]) {
      expect(readFileSync(new URL(file, import.meta.url), "utf8")).not.toMatch(
        /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i,
      );
    }
  });
});
