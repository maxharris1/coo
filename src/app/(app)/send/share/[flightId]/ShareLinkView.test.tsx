import {
  Children,
  type ComponentProps,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ShareLinkGone, ShareLinkView } from "./ShareLinkView";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const URL_ = "https://coo.test/b/gerald-7QK4";

const props = (
  over: Partial<ComponentProps<typeof ShareLinkView>> = {},
): ComponentProps<typeof ShareLinkView> => ({
  flightId: "f1",
  bird: { name: "Gerald", look: "gerald", gear: ["goggles"] },
  pronoun: "he",
  guestName: "Maya",
  place: "Fishtown",
  lands: "11:20 am",
  url: URL_,
  canShare: true,
  onCopy: () => {},
  onShare: () => {},
  ...over,
});

const text = (html: string) =>
  html
    .replace(/<svg[\s\S]*?<\/svg>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&#x27;", "'")
    .replace(/\s+/g, " ")
    .trim();

type Clickable = ReactElement<{ children?: ReactNode; onClick?: () => void }>;

function find(node: ReactNode, label: string): Clickable | undefined {
  if (!isValidElement<{ children?: ReactNode; onClick?: () => void }>(node))
    return undefined;
  if (node.props.onClick && text(renderToStaticMarkup(node)) === label)
    return node;
  for (const child of Children.toArray(node.props.children)) {
    const hit = find(child, label);
    if (hit) return hit;
  }
  return undefined;
}

describe("ShareLinkView", () => {
  it("reads as the mock, top to bottom", () => {
    const html = renderToStaticMarkup(<ShareLinkView {...props()} />);
    expect(text(html)).toBe(
      [
        "Gerald is in the air",
        "Flying to Fishtown. Lands about 11:20 am.",
        "Now text Maya their link",
        "What Maya gets",
        "I sent you a pigeon. For real. Watch him fly to you:",
        URL_,
        "Text it to Maya",
        "Copy link",
        "Share another way",
        "They can watch the flight the moment they tap it.",
        "The note stays sealed until Gerald lands.",
        "No app or account needed to read it.",
        "Not opened in 7 days? The note comes back to you.",
        "Watch the flight",
      ].join(" "),
    );
    expect(html).toMatch(/<h1[^>]*>Now text Maya their link<\/h1>/);
  });

  it("texts the share template with the bird's pronoun and the link", () => {
    const html = renderToStaticMarkup(
      <ShareLinkView {...props({ pronoun: "she" })} />,
    );
    const href = html
      .match(/<a href="(sms:[^"]*)"/)![1]
      .replaceAll("&amp;", "&");
    expect(decodeURIComponent(href.split("body=")[1])).toBe(
      `I sent you a pigeon. For real. Watch her fly to you: ${URL_}`,
    );
    expect(text(html)).toContain("Watch her fly to you:");
  });

  it("drops the arrival sentence it cannot fill", () => {
    const html = renderToStaticMarkup(
      <ShareLinkView {...props({ lands: undefined })} />,
    );
    expect(text(html)).toContain(
      "Gerald is in the air Flying to Fishtown. Now text",
    );
  });

  it("copies and shares from its buttons", () => {
    const onCopy = vi.fn();
    const onShare = vi.fn();
    const tree = ShareLinkView(props({ onCopy, onShare }));
    find(tree, "Copy link")!.props.onClick!();
    expect(onCopy).toHaveBeenCalledOnce();
    find(tree, "Share another way")!.props.onClick!();
    expect(onShare).toHaveBeenCalledOnce();
  });

  it("leaves out Share another way when the browser cannot share", () => {
    const html = renderToStaticMarkup(
      <ShareLinkView {...props({ canShare: false })} />,
    );
    expect(text(html)).not.toContain("Share another way");
    expect(text(html)).toContain("Copy link");
  });

  it("links to the tracker at the bottom", () => {
    const html = renderToStaticMarkup(<ShareLinkView {...props()} />);
    expect(html).toMatch(/<a href="\/flights\/f1"[^>]*>Watch the flight<\/a>/);
  });
});

describe("ShareLinkGone", () => {
  it("says the link was shown once and still goes to the flight", () => {
    const html = renderToStaticMarkup(<ShareLinkGone flightId="f1" />);
    expect(text(html)).toBe(
      "This link was shown once. Send another bird to make a new one. Watch the flight",
    );
    expect(html).toMatch(/<a href="\/flights\/f1"[^>]*>Watch the flight<\/a>/);
  });
});
