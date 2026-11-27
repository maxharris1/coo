import { readFileSync } from "node:fs";
import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { config } from "@/lib/config";
import { EspressoSheet } from "./EspressoSheet";

const shot = config.game.consumables.find((c) => c.id === "espresso")!;

type Key = {
  key: string;
  shiftKey?: boolean;
  target?: unknown;
  preventDefault: () => void;
};
type El = ReactElement<{
  children?: ReactNode;
  role?: string;
  "aria-label"?: string;
  onClick?: () => void;
  onKeyDown?: (e: Key) => void;
  ref?: (el: unknown) => void;
}>;

function find(node: ReactNode, hit: (el: El) => boolean): El | undefined {
  if (!isValidElement<El["props"]>(node)) return undefined;
  if (hit(node)) return node;
  for (const child of Children.toArray(node.props.children)) {
    const found = find(child, hit);
    if (found) return found;
  }
  return undefined;
}

const html = (held: number) =>
  renderToStaticMarkup(<EspressoSheet held={held} onClose={() => {}} />)
    .replaceAll("&#x27;", "'")
    .replaceAll("&quot;", '"');

const tree = (onClose = vi.fn()) => {
  let out: ReactNode = null;
  function Probe() {
    out = EspressoSheet({ held: 2, onClose });
    return null;
  }
  renderToStaticMarkup(<Probe />);
  return { node: out as ReactNode, onClose };
};

const press = (
  node: ReactNode,
  key: string,
  target?: unknown,
  shift = false,
) => {
  const preventDefault = vi.fn();
  find(node, (el) => el.props.onKeyDown !== undefined)?.props.onKeyDown?.({
    key,
    shiftKey: shift,
    target,
    preventDefault,
  });
  return preventDefault;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the espresso sheet (#1046 ac-2)", () => {
  it("is a modal dialog named by the shot's name from config", () => {
    const out = html(2);
    const id = out.match(/role="dialog"[^>]*aria-labelledby="([^"]+)"/)?.[1];
    expect(out).toContain('aria-modal="true"');
    expect(out).toMatch(new RegExp(`<h2 id="${id}"[^>]*>${shot.name}</h2>`));
  });

  it("shows the effect line and the price in seeds from config", () => {
    const out = html(2);
    expect(out).toContain(`>${shot.effect}<`);
    expect(out).toContain(`>${shot.price} seeds<`);
  });

  it("shows how many shots the player holds", () => {
    expect(html(2)).toContain(">You hold 2 shots<");
    expect(html(1)).toContain(">You hold 1 shot<");
    expect(html(0)).toContain(">You hold 0 shots<");
  });

  it("offers no way to buy yet", () => {
    expect(html(2)).not.toMatch(/>Buy/);
  });

  it("uses only tokens for colour in its stylesheet", () => {
    const css = readFileSync(
      new URL("./EspressoSheet.module.css", import.meta.url),
      "utf8",
    );
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
  });
});

describe("closing the espresso sheet (#1046 ac-3)", () => {
  it("closes from the Close button", () => {
    const { node, onClose } = tree();
    find(node, (el) => el.props.children === "Close")?.props.onClick?.();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes from the backdrop, which stays out of the Tab order", () => {
    const { node, onClose } = tree();
    find(node, (el) => el.props["aria-label"] === "Close")?.props.onClick?.();
    expect(onClose).toHaveBeenCalledOnce();
    expect(html(2)).toMatch(/<button[^>]*aria-label="Close"[^>]*tabindex="-1"/);
  });

  it("closes on Escape and ignores other keys", () => {
    const { node, onClose } = tree();
    press(node, "a");
    expect(onClose).not.toHaveBeenCalled();
    press(node, "Escape");
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("focus in the espresso sheet (#1046 ac-3)", () => {
  const mounted = () => {
    const opener = { focus: vi.fn() };
    vi.stubGlobal("document", { activeElement: opener });
    const { node } = tree();
    const items = [{ focus: vi.fn() }, { focus: vi.fn() }];
    const dialog = { focus: vi.fn(), querySelectorAll: () => items };
    const ref = find(node, (el) => el.props.role === "dialog")?.props.ref;
    ref?.(dialog);
    return { node, opener, dialog, items, unmount: () => ref?.(null) };
  };

  it("moves focus into the sheet on open", () => {
    expect(mounted().dialog.focus).toHaveBeenCalledOnce();
  });

  it("wraps Tab from the last control to the first", () => {
    const { node, items } = mounted();
    expect(press(node, "Tab", items[1])).toHaveBeenCalled();
    expect(items[0].focus).toHaveBeenCalledOnce();
  });

  it("wraps Shift+Tab from the first control to the last", () => {
    const { node, items } = mounted();
    expect(press(node, "Tab", items[0], true)).toHaveBeenCalled();
    expect(items[1].focus).toHaveBeenCalledOnce();
  });

  it("returns focus to what opened it on close", () => {
    const { opener, unmount } = mounted();
    unmount();
    expect(opener.focus).toHaveBeenCalledOnce();
  });
});
