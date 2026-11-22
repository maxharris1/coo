import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DOODLE_COLORS } from "@/lib/game/notes";
import { DoodlePad, holdScroll, padPointer } from "./DoodlePad";
import type { DraftAction } from "./draft";

const css = readFileSync(
  new URL("./DoodlePad.module.css", import.meta.url),
  "utf8",
);

const surface = () => ({
  setPointerCapture: vi.fn(),
  getBoundingClientRect: () => ({
    left: 100,
    top: 50,
    width: 600,
    height: 400,
  }),
});

const pointer = (
  target: ReturnType<typeof surface>,
  pointerId: number,
  clientX: number,
  clientY: number,
) => ({
  pointerId,
  clientX,
  clientY,
  currentTarget: target,
  preventDefault: vi.fn(),
});

describe("DoodlePad", () => {
  it("is labelled, with ink selected and a named swatch per palette colour", () => {
    const html = renderToStaticMarkup(<DoodlePad onChange={() => {}} />);
    expect(html).toContain('aria-label="Doodle pad"');
    for (const color of DOODLE_COLORS) {
      const name = color[0].toUpperCase() + color.slice(1);
      const swatch = html.match(
        new RegExp(`<button[^>]*aria-label="${name}"[^>]*>`),
      )![0];
      expect(swatch).toContain(`aria-pressed="${color === "ink"}"`);
    }
    expect(html).toMatch(/<button[^>]*aria-label="Undo last stroke"/);
    expect(html).toMatch(/<button[^>]*aria-label="Clear doodle"/);
  });

  it("blocks touch scrolling on the drawing surface only, with 44 px buttons", () => {
    const rules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)];
    const touchNone = rules.filter(([, , body]) =>
      /touch-action:\s*none/.test(body),
    );
    expect(touchNone.map(([, sel]) => sel.trim())).toEqual([".surface"]);
    const button = rules.find(([, sel]) => sel.trim() === ".button")![2];
    expect(button).toMatch(/min-width:\s*var\(--coo-touch\)/);
    expect(button).toMatch(/min-height:\s*var\(--coo-touch\)/);
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("captures the pointer and maps it onto the 300 by 200 canvas", () => {
    const sent: DraftAction[] = [];
    const handlers = padPointer((a) => sent.push(a));
    const el = surface();
    const down = pointer(el, 7, 400, 250);
    handlers.onPointerDown(down);
    expect(el.setPointerCapture).toHaveBeenCalledWith(7);
    expect(down.preventDefault).toHaveBeenCalled();
    const move = pointer(el, 7, 700, 450);
    handlers.onPointerMove(move);
    expect(move.preventDefault).toHaveBeenCalled();
    handlers.onPointerUp(pointer(el, 7, 700, 450));
    expect(sent).toEqual([
      { type: "down", point: [150, 100] },
      { type: "move", point: [300, 200] },
      { type: "up" },
    ]);
  });

  it("follows only the first pointer and ignores hover moves", () => {
    const sent: DraftAction[] = [];
    const handlers = padPointer((a) => sent.push(a));
    const el = surface();
    handlers.onPointerMove(pointer(el, 1, 200, 100));
    handlers.onPointerDown(pointer(el, 1, 100, 50));
    handlers.onPointerDown(pointer(el, 2, 300, 300));
    handlers.onPointerMove(pointer(el, 2, 310, 310));
    handlers.onPointerUp(pointer(el, 2, 310, 310));
    handlers.onPointerCancel(pointer(el, 1, 100, 50));
    handlers.onPointerMove(pointer(el, 1, 200, 100));
    expect(sent).toEqual([{ type: "down", point: [0, 0] }, { type: "cancel" }]);
  });

  it("stops a vertical swipe scrolling the page only while a pointer is down", () => {
    const target = new EventTarget();
    let drawing = false;
    const release = holdScroll(target, () => drawing);
    const swipe = () => {
      const event = new Event("touchmove", { cancelable: true });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(swipe()).toBe(false);
    drawing = true;
    expect(swipe()).toBe(true);
    release();
    expect(swipe()).toBe(false);
  });
});
