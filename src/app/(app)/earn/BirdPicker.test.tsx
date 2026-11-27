import { readFileSync } from "node:fs";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import { BirdPicker, rowLabels, type PickableBird } from "./BirdPicker";

const BIRDS: PickableBird[] = [
  { id: "b-pip-1", name: "Pip", look: "gerald", gear: [] },
  { id: "b-dot", name: "Dot", look: "kevin", gear: [] },
  {
    id: "b-pip-2",
    name: "Pip",
    look: "brenda",
    gear: ["beanie", "goggles"],
  },
];

type DomNode = EventTarget & {
  nodeType: number;
  tagName?: string;
  textContent?: string;
  innerHTML?: string;
  attrs: Record<string, string>;
  childNodes: DomNode[];
  parentNode: DomNode | null;
  contains: (other: unknown) => boolean;
  focus: () => void;
};

const ATTR = /\[([\w-]+)(?:='([^']*)')?\]/g;
const matches = (n: DomNode, selector: string) =>
  n.nodeType === 1 &&
  selector.split(",").some((part) => {
    const [, tag, rest] = part.trim().match(/^([a-z]*)(.*)$/)!;
    const [must, not] = rest.split(":not(");
    const has = (attrs: string) =>
      [...attrs.matchAll(ATTR)].every(([, name, value]) =>
        value === undefined ? name in n.attrs : n.attrs[name] === value,
      );
    return (
      (!tag || n.tagName === tag.toUpperCase()) &&
      has(must) &&
      (not === undefined || !has(not))
    );
  });

const descendants = (n: DomNode): DomNode[] =>
  n.childNodes.flatMap((c) => [c, ...descendants(c)]);

function domNode(nodeType: number, tagName?: string, nodeValue?: string) {
  const self: DomNode = Object.assign(new EventTarget(), {
    nodeType,
    nodeName: tagName,
    tagName,
    nodeValue,
    ownerDocument: document,
    style: { setProperty() {}, removeProperty() {} },
    attrs: {} as Record<string, string>,
    childNodes: [] as DomNode[],
    parentNode: null,
    setAttribute: (name: string, value: unknown) =>
      void (self.attrs[name] = String(value)),
    removeAttribute: (name: string) => void delete self.attrs[name],
    appendChild(child: DomNode) {
      child.parentNode = self;
      self.childNodes.push(child);
      return child;
    },
    insertBefore(child: DomNode, before: DomNode) {
      child.parentNode = self;
      self.childNodes.splice(self.childNodes.indexOf(before), 0, child);
      return child;
    },
    removeChild(child: DomNode) {
      self.childNodes.splice(self.childNodes.indexOf(child), 1);
      return child;
    },
    contains: (other: unknown) =>
      other === self || descendants(self).includes(other as DomNode),
    querySelectorAll: (selector: string) =>
      descendants(self).filter((d) => matches(d, selector)),
    focus: () => Object.assign(document, { activeElement: self }),
  });
  return Object.defineProperties(self, {
    firstChild: { get: () => self.childNodes[0] ?? null },
    lastChild: { get: () => self.childNodes.at(-1) ?? null },
  });
}

async function mountPicker(birds = BIRDS) {
  const onChoose = vi.fn();
  const onClose = vi.fn();
  const opener = { focus: vi.fn() };
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { HTMLIFrameElement: class {} }),
  );
  vi.stubGlobal(
    "document",
    Object.assign(new EventTarget(), {
      activeElement: null,
      createElement: (tag: string) => domNode(1, tag.toUpperCase()),
      createElementNS: (_ns: string, tag: string) => domNode(1, tag),
      createTextNode: (text: string) => domNode(3, undefined, text),
    }),
  );
  const container = domNode(1, "DIV");
  const root = createRoot(container as unknown as Element);
  onTestFinished(async () => {
    await act(async () => root.unmount());
    vi.unstubAllGlobals();
  });
  const render = (birds: PickableBird[]) =>
    act(async () =>
      root.render(
        <BirdPicker
          birds={birds}
          opener={opener as unknown as HTMLElement}
          onChoose={onChoose}
          onClose={onClose}
        />,
      ),
    );
  await render(birds);
  const all = descendants(container);
  const dialog = all.find((n) => n.attrs.role === "dialog")!;
  const close = all.find(
    (n) => n.tagName === "BUTTON" && n.textContent === "Close",
  )!;
  const rowsOf = () =>
    descendants(dialog).filter((n) => n.tagName === "BUTTON" && n !== close);
  const dispatch = async (
    type: string,
    target: unknown,
    init: Record<string, unknown> = {},
  ) => {
    const event = Object.assign(
      new Event(type, { bubbles: true, cancelable: true }),
      init,
    );
    Object.defineProperty(event, "target", { value: target });
    await act(async () => {
      if (container.contains(target)) container.dispatchEvent(event);
      document.dispatchEvent(event);
    });
    return event.defaultPrevented;
  };
  const key = (key: string, shiftKey = false) =>
    dispatch("keydown", document.activeElement, { key, shiftKey });
  return {
    onChoose,
    onClose,
    opener,
    dialog,
    close,
    rows: rowsOf(),
    rowsOf,
    render,
    backdrop: all.find((n) => n.attrs["aria-label"] === "Close")!,
    dispatch,
    key,
    tab: (shiftKey = false) => key("Tab", shiftKey),
  };
}

const markupOf = (birds: PickableBird[]) =>
  renderToStaticMarkup(
    <BirdPicker
      birds={birds}
      opener={null}
      onChoose={() => {}}
      onClose={() => {}}
    />,
  );
const markup = markupOf(BIRDS);
const rowsIn = (html: string) =>
  [...html.matchAll(/<li[^>]*>.*?<\/li>/gs)].map((m) => m[0]);
const svgOf = (row: string) => row.match(/<svg.*<\/svg>/s)?.[0];
const labelOf = (row: string) =>
  row.match(/<button[^>]*aria-label="([^"]*)"/)?.[1];
const pip = (id: string, extra: Partial<PickableBird> = {}): PickableBird => ({
  id,
  name: "Pip",
  look: "gerald",
  gear: [],
  ...extra,
});

const css = readFileSync(
  new URL("./BirdPicker.module.css", import.meta.url),
  "utf8",
);
const rule = (cls: string) =>
  css.match(new RegExp(`\\.${cls} \\{[^}]*\\}`))?.[0];
const px = (block: string | undefined, prop: string) =>
  Number(block?.match(new RegExp(`${prop}: (-?\\d+)px`))?.[1] ?? 0);

describe("BirdPicker lists the home birds (ac-1)", () => {
  it("opens a modal dialog titled Who goes?", () => {
    expect(markup).toMatch(/<div[^>]*role="dialog"[^>]*aria-modal="true"/);
    const id = markup.match(/aria-labelledby="([^"]+)"/)?.[1];
    expect(id).toBeTruthy();
    expect(markup).toContain(`<h2 id="${id}"`);
    expect(markup).toMatch(/<h2[^>]*>Who goes\?<\/h2>/);
  });

  it("gives every bird one row with its avatar and name", () => {
    const rows = rowsIn(markup);
    expect(rows).toHaveLength(3);
    rows.forEach((row, i) => {
      expect(row.match(/<button/g)).toHaveLength(1);
      expect(row).toContain("<svg");
      expect(row).toContain(`>${BIRDS[i].name}<`);
    });
  });

  it("tells the two birds named Pip apart by avatar and label", () => {
    const [pip1, dot, pip2] = rowsIn(markup);
    expect(svgOf(pip1)).toBeTruthy();
    expect(svgOf(pip1)).not.toBe(svgOf(pip2));
    expect(labelOf(pip1)).toBeTruthy();
    expect(labelOf(pip2)).toBeTruthy();
    expect(labelOf(pip1)).not.toBe(labelOf(pip2));
    expect(labelOf(dot)).toBeUndefined();
  });

  it("shows the whole bird inside the 42 px avatar, feet and leg gear included", () => {
    const avatar = rule("avatar");
    const [w, h] = ["width", "height"].map((p) => px(avatar, p));
    expect([w, h]).toEqual([42, 42]);
    const bird = rule("avatarBird");
    const [left, top] = ["left", "top"].map((p) => px(bird, p));
    for (const row of rowsIn(markupOf([pip("a", { gear: ["booties"] })]))) {
      const [, svgW, svgH] = svgOf(row)!
        .match(/<svg[^>]*width="(\d+)"[^>]*height="(\d+)"/)!
        .map(Number);
      expect(left).toBeGreaterThanOrEqual(0);
      expect(top).toBeGreaterThanOrEqual(0);
      expect(left + svgW).toBeLessThanOrEqual(w);
      expect(top + svgH).toBeLessThanOrEqual(h);
    }
  });

  it("numbers two Pips that differ only by gear, with different avatars", () => {
    const [plain, booted] = rowsIn(
      markupOf([pip("a"), pip("b", { gear: ["booties"] })]),
    );
    expect(labelOf(plain)).toBe("Pip, looks like Gerald, 1 of 2");
    expect(labelOf(booted)).toBe(
      "Pip, looks like Gerald, wearing Rain booties, 2 of 2",
    );
    expect(svgOf(plain)).not.toBe(svgOf(booted));
  });

  it("numbers two identical Pips so their labels still differ", () => {
    const [first, second] = rowsIn(markupOf([pip("a"), pip("b")]));
    expect(labelOf(first)).toBe("Pip, looks like Gerald, 1 of 2");
    expect(labelOf(second)).toBe("Pip, looks like Gerald, 2 of 2");
  });

  it("treats Pip and pip as the same name, like birdName does", () => {
    const [upper, lower] = rowsIn(
      markupOf([pip("a"), pip("b", { name: "pip", look: "brenda" })]),
    );
    expect(labelOf(upper)).toBe("Pip, looks like Gerald, 1 of 2");
    expect(labelOf(lower)).toBe("pip, looks like Brenda, 2 of 2");
  });

  it("never gives two rows the same accessible name, even when a name reads like a label", () => {
    const flock = [
      pip("a"),
      pip("b", { name: "pip", look: "kevin" }),
      pip("c", { name: "Pip, looks like Gerald", look: "brenda" }),
    ];
    const spoken = rowsIn(markupOf(flock)).map(
      (row, i) => labelOf(row) ?? flock[i].name,
    );
    expect(spoken).toEqual([
      "Pip, looks like Gerald, 1 of 2",
      "pip, looks like Kevin, 2 of 2",
      "Pip, looks like Gerald",
    ]);
  });

  it("taps a row to choose that bird without closing", async () => {
    const { rows, dispatch, onChoose, onClose } = await mountPicker();
    await dispatch("click", rows[2]);
    expect(onChoose).toHaveBeenCalledExactlyOnceWith("b-pip-2");
    expect(onClose).not.toHaveBeenCalled();
    await dispatch("click", rows[1]);
    expect(onChoose).toHaveBeenLastCalledWith("b-dot");
  });
});

describe("rowLabels (ac-1)", () => {
  const spokenNames = (birds: PickableBird[]) =>
    rowLabels(birds).map((label, i) =>
      (label ?? birds[i].name).toLowerCase().trim(),
    );

  it("leaves uniquely named birds to their visible names", () => {
    expect(rowLabels([BIRDS[0], BIRDS[1]])).toEqual([undefined, undefined]);
  });

  it("numbers every bird in a name clash, with its look and worn gear", () => {
    expect(rowLabels(BIRDS)).toEqual([
      "Pip, looks like Gerald, 1 of 2",
      undefined,
      "Pip, looks like Brenda, wearing Wool beanie and Aviator goggles, 2 of 2",
    ]);
  });

  it("numbers names that clash after trimming and case folding", () => {
    expect(
      rowLabels([
        pip("a"),
        pip("b", { name: " pip" }),
        pip("c", { name: "PIP " }),
      ]),
    ).toEqual([
      "Pip, looks like Gerald, 1 of 3",
      " pip, looks like Gerald, 2 of 3",
      "PIP , looks like Gerald, 3 of 3",
    ]);
  });

  it.each([
    [
      "a raw name equal to a described label",
      [
        pip("a"),
        pip("b", { name: "pip", look: "kevin" }),
        pip("c", { name: "Pip, looks like Gerald", look: "brenda" }),
      ],
    ],
    [
      "a raw name equal to a numbered label",
      [
        pip("a"),
        pip("b"),
        pip("c", { name: "Pip, looks like Gerald, 1 of 2", look: "brenda" }),
      ],
    ],
    [
      "a raw name equal to a numbered label of another case",
      [
        pip("a"),
        pip("b"),
        pip("c", { name: "pip, LOOKS LIKE GERALD, 2 OF 2" }),
        pip("d", { name: "pip, looks like gerald, 2 of 2" }),
      ],
    ],
  ])("gives every row a distinct accessible name with %s", (_, birds) => {
    const spoken = spokenNames(birds);
    expect(new Set(spoken).size).toBe(birds.length);
  });
});

describe("BirdPicker as a keyboard modal (ac-3)", () => {
  it("keeps the backdrop out of the Tab order", () => {
    expect(markup).toMatch(/<button[^>]*aria-label="Close"[^>]*tabindex="-1"/);
  });

  it("focuses the dialog when it opens", async () => {
    const { dialog } = await mountPicker();
    expect(document.activeElement).toBe(dialog);
  });

  it("keeps Tab and Shift+Tab inside the dialog, never on the backdrop", async () => {
    const { dialog, backdrop, rows, close, tab } = await mountPicker();
    const expected = [rows[0], rows[1], rows[0], close, rows[0]];
    for (const [i, shiftKey] of [false, false, true, true, false].entries()) {
      expect(await tab(shiftKey)).toBe(true);
      expect(dialog.contains(document.activeElement)).toBe(true);
      expect(document.activeElement).not.toBe(backdrop);
      expect(document.activeElement).toBe(expected[i]);
    }
  });

  it("tabs through the rows, then Close, then wraps", async () => {
    const { rows, close, tab } = await mountPicker();
    const order = [];
    for (let i = 0; i < 5; i++) {
      await tab();
      order.push(document.activeElement);
    }
    expect(order).toEqual([...rows, close, rows[0]]);
  });

  it("returns Tab and Shift+Tab to the dialog after a press on the backdrop", async () => {
    const { dialog, backdrop, rows, close, key } = await mountPicker();
    for (const [shiftKey, lands] of [
      [false, rows[0]],
      [true, close],
    ] as const) {
      backdrop.focus();
      expect(await key("Tab", shiftKey)).toBe(true);
      expect(dialog.contains(document.activeElement)).toBe(true);
      expect(document.activeElement).toBe(lands);
    }
  });

  it("swallows a mousedown on the backdrop so focus stays put", async () => {
    const { backdrop, dispatch } = await mountPicker();
    expect(await dispatch("mousedown", backdrop)).toBe(true);
  });

  it.each<[string, (m: Awaited<ReturnType<typeof mountPicker>>) => unknown]>([
    ["Escape", ({ key }) => key("Escape")],
    ["the backdrop", ({ dispatch, backdrop }) => dispatch("click", backdrop)],
    ["the Close button", ({ dispatch, close }) => dispatch("click", close)],
  ])("closes with %s and hands focus back to the opener", async (_, how) => {
    const m = await mountPicker();
    await how(m);
    expect(m.onClose).toHaveBeenCalledOnce();
    expect(m.onChoose).not.toHaveBeenCalled();
    expect(m.opener.focus).toHaveBeenCalledOnce();
    expect(m.onClose.mock.invocationCallOrder[0]).toBeLessThan(
      m.opener.focus.mock.invocationCallOrder[0],
    );
  });

  it("prevents the browser's own Escape handling", async () => {
    const { key } = await mountPicker();
    expect(await key("Escape")).toBe(true);
  });

  it("keeps the trap when the focused row leaves the list while open", async () => {
    const m = await mountPicker();
    await m.tab();
    expect(document.activeElement).toBe(m.rows[0]);
    await m.render([BIRDS[1], BIRDS[2]]);
    expect(m.rowsOf()).toHaveLength(2);
    expect(m.dialog.contains(document.activeElement)).toBe(true);
    for (const shiftKey of [false, true, true]) {
      expect(await m.tab(shiftKey)).toBe(true);
      expect(m.dialog.contains(document.activeElement)).toBe(true);
      expect(document.activeElement).not.toBe(m.backdrop);
    }
    expect(document.activeElement).toBe(m.rowsOf()[1]);
    expect(await m.key("Escape")).toBe(true);
    expect(m.onClose).toHaveBeenCalledOnce();
    expect(m.onChoose).not.toHaveBeenCalled();
    expect(m.opener.focus).toHaveBeenCalledOnce();
  });
});

describe("BirdPicker styles", () => {
  it("keeps rows and Close at least the 44 px touch size", () => {
    for (const cls of ["row", "close"]) {
      expect(rule(cls), `.${cls}`).toMatch(
        /min-(height|block-size): (var\(--coo-touch\)|4[4-9]px|[5-9]\dpx)/,
      );
    }
  });

  it("stops the slide when the person asks for reduced motion", () => {
    const block = css.match(
      /@media \(prefers-reduced-motion: reduce\) \{([^@]*)\}\s*$/,
    )?.[1];
    expect(block).toMatch(/\.sheet\b/);
    expect(block).toContain("animation: none !important");
  });
});
