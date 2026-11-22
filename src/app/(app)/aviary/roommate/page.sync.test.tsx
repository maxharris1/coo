import { act, type Dispatch } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SyncContext, type SyncState } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import { ToastContext } from "@/components/Toasts";
import type { RoommateAction, RoommateState } from "./roommate";
import RoommatePage from "./page";

const views: { state: RoommateState; dispatch: Dispatch<RoommateAction> }[] =
  [];

vi.mock("./RoommateView", () => ({
  RoommateView: (props: {
    state: RoommateState;
    dispatch: Dispatch<RoommateAction>;
  }) => {
    views.push(props);
    return null;
  },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {} }),
}));

type Bird = { name: string; look: string };

const syncOf = (birds: Bird[], perches: number): SyncState => ({
  data: { me: { perches }, birds } as unknown as SyncPayload,
  error: null,
  offsetMs: 0,
  refresh: () => {},
});

const page = (sync: SyncState) => (
  <SyncContext.Provider value={sync}>
    <ToastContext.Provider value={() => {}}>
      <RoommatePage />
    </ToastContext.Provider>
  </SyncContext.Provider>
);

const last = () => views.at(-1)!;

let root: Root;

beforeEach(() => {
  views.length = 0;
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { HTMLIFrameElement: class {} }),
  );
  vi.stubGlobal("document", new EventTarget());
  root = createRoot(
    Object.assign(new EventTarget(), {
      nodeType: 1,
      tagName: "DIV",
      ownerDocument: document,
    }) as unknown as Element,
  );
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

const show = (sync: SyncState) => act(async () => root.render(page(sync)));

const gerald = { name: "Gerald", look: "kevin" };

it("drops the form once a sync shows the roommate already moved in", async () => {
  await show(syncOf([gerald], 3));
  expect(last().state).toMatchObject({ kind: "naming", first: "Gerald" });

  await show(syncOf([gerald, { name: "Brenda", look: "brenda" }], 3));
  expect(last().state).toEqual({ kind: "none" });
});

it("opens the form once a sync frees a perch", async () => {
  await show(syncOf([gerald], 1));
  expect(last().state).toEqual({ kind: "none" });

  await show(syncOf([gerald], 2));
  expect(last().state).toMatchObject({
    kind: "naming",
    first: "Gerald",
    name: "Brenda",
  });
});

it("follows a rename of the first bird in the heading and the free default", async () => {
  await show(syncOf([gerald], 2));
  expect(last().state).toMatchObject({ first: "Gerald", name: "Brenda" });

  await show(syncOf([{ name: "Brenda", look: "kevin" }], 2));
  expect(last().state).toMatchObject({ kind: "naming", first: "Brenda" });
  expect(last().state).not.toMatchObject({ name: "Brenda" });
});

it("keeps a typed name and the chosen pronoun across a sync", async () => {
  await show(syncOf([gerald], 2));
  await act(async () => {
    last().dispatch({ type: "name", name: "Mabel" });
    last().dispatch({ type: "pronoun", pronoun: "she" });
  });

  await show(syncOf([{ name: "Gerry", look: "kevin" }], 2));
  expect(last().state).toMatchObject({
    kind: "naming",
    first: "Gerry",
    name: "Mabel",
    pronoun: "she",
  });
});

it("holds a sync while Adopt is in flight and applies it if the adopt fails", async () => {
  await show(syncOf([gerald], 3));
  await act(async () => last().dispatch({ type: "send" }));

  await show(syncOf([gerald, { name: "Brenda", look: "brenda" }], 3));
  expect(last().state).toMatchObject({ kind: "naming", sending: true });

  await act(async () => last().dispatch({ type: "failed" }));
  expect(last().state).toEqual({ kind: "none" });
});
