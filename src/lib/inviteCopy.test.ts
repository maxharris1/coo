import { describe, expect, it } from "vitest";
import { config } from "@/lib/config";
import { inviteCopy, inviteMetadata, inviteShareText } from "./inviteCopy";

const SUBHEAD = "Keep a pigeon and send notes, at pigeon speed.";

describe("inviteCopy", () => {
  it("names the inviter in every field", () => {
    expect(inviteCopy("Priya")).toEqual({
      headline: "Priya saved you a perch.",
      subhead: SUBHEAD,
      title: "Priya saved you a perch",
      addButton: "Add Priya",
    });
  });

  it("trims the inviter's name", () => {
    expect(inviteCopy("  Priya ")).toEqual({
      headline: "Priya saved you a perch.",
      subhead: SUBHEAD,
      title: "Priya saved you a perch",
      addButton: "Add Priya",
    });
  });

  it.each([undefined, null, "", "   "])(
    "falls back to a friend when the name is %j",
    (name) => {
      expect(inviteCopy(name)).toEqual({
        headline: "A friend saved you a perch.",
        subhead: SUBHEAD,
        title: "A friend saved you a perch",
        addButton: "Add friend",
      });
    },
  );
});

describe("inviteShareText", () => {
  it("offers a perch with the link", () => {
    expect(inviteShareText("https://coo.example/join/max")).toBe(
      `I saved you a perch on ${config.app.name}: https://coo.example/join/max`,
    );
  });
});

describe("inviteMetadata", () => {
  it("titles the preview with the inviter's name", () => {
    expect(inviteMetadata("Priya")).toEqual({
      title: "Priya saved you a perch",
      description: SUBHEAD,
      openGraph: { title: "Priya saved you a perch", description: SUBHEAD },
    });
  });

  it("falls back to a friend without a name", () => {
    expect(inviteMetadata("  ")).toEqual({
      title: "A friend saved you a perch",
      description: SUBHEAD,
      openGraph: { title: "A friend saved you a perch", description: SUBHEAD },
    });
  });
});

describe("invite wording", () => {
  it("never talks about trading pigeons", () => {
    const strings = ["Priya", null].flatMap((name) => [
      ...Object.values(inviteCopy(name)),
      JSON.stringify(inviteMetadata(name)),
    ]);
    strings.push(inviteShareText("https://coo.example/join/max"));
    for (const text of strings) expect(text).not.toMatch(/trade/i);
  });
});
