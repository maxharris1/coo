import type { Metadata } from "next";
import { config } from "@/lib/config";

export type InviteCopy = {
  headline: string;
  subhead: string;
  title: string;
  addButton: string;
};

const SUBHEAD = "Keep a pigeon and send notes, at pigeon speed.";

export function inviteCopy(name: string | null | undefined): InviteCopy {
  const trimmed = name?.trim();
  const title = `${trimmed || "A friend"} saved you a perch`;
  return {
    headline: `${title}.`,
    subhead: SUBHEAD,
    title,
    addButton: trimmed ? `Add ${trimmed}` : "Add friend",
  };
}

export function inviteShareText(link: string): string {
  return `I saved you a perch on ${config.app.name}: ${link}`;
}

export function inviteMetadata(name: string | null | undefined): Metadata {
  const { title, subhead } = inviteCopy(name);
  return {
    title,
    description: subhead,
    openGraph: { title, description: subhead },
  };
}
