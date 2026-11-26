import { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SyncContext, type SyncState } from "@/components/SyncProvider";
import type { SyncPayload } from "@/components/sync";
import { snap } from "@/lib/game/privacy";
import type { Me } from "@/server/rows";
import type * as SettingsViewModule from "./SettingsView";
import type { SettingsViewProps } from "./SettingsView";
import SettingsPage from "./page";

const view = vi.hoisted(() => ({
  props: null as SettingsViewProps | null,
  toasts: [] as string[],
  toast: (message: string) => void view.toasts.push(message),
  push: (path: string) => void view.pushed.push(path),
  pushed: [] as string[],
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: view.push }),
}));

vi.mock("./SettingsView", () => ({
  SettingsView: (props: SettingsViewProps) => {
    view.props = props;
    return null;
  },
}));

vi.mock("@/components/Toasts", () => ({
  useToast: () => view.toast,
}));

const ME = {
  id: "me-1",
  name: "Max",
  handle: "max",
  units: "mi",
  phoneLast4: "0142",
  installed: true,
  loft: null,
  settings: {
    notifyLandedIn: true,
    notifyLandedOut: true,
    notifyDelays: true,
    notifyHungry: false,
    quietOn: true,
    quietStart: 22,
    quietEnd: 7,
    smsFallback: false,
  },
} as Me;

let patchResponse: () => Response;
let travelResponse: () => Response;
let deleteResponse: () => Response;
let searchResponse: () => Response;
let events: string[];
let bodies: unknown[];
let root: Root;
let sync: SyncState;

function fakeFetch(url: RequestInfo | URL, init?: RequestInit) {
  const method = init?.method ?? "GET";
  events.push(`${method} ${String(url)}`);
  if (String(url) === "/api/auth/sign-out" && method === "POST") {
    return Promise.resolve(Response.json({}));
  }
  if (String(url) === "/api/settings" && method === "PATCH") {
    bodies.push(JSON.parse(String(init?.body)));
    return Promise.resolve(patchResponse());
  }
  if (String(url) === "/api/loft/travel" && method === "POST") {
    bodies.push(JSON.parse(String(init?.body)));
    return Promise.resolve(travelResponse());
  }
  if (String(url).startsWith("/api/geo/search?") && method === "GET") {
    return Promise.resolve(searchResponse());
  }
  if (String(url) === "/api/account" && method === "DELETE") {
    bodies.push(JSON.parse(String(init?.body)));
    return Promise.resolve(deleteResponse());
  }
  return Promise.reject(new Error(`unexpected ${method} ${String(url)}`));
}

const syncWith = (me: Me): SyncState => ({
  data: { serverNow: 0, me } as unknown as SyncPayload,
  error: null,
  offsetMs: 0,
  refresh: () => void events.push("refresh"),
});

async function render(state: SyncState) {
  sync = state;
  await act(async () => {
    root.render(
      <SyncContext.Provider value={sync}>
        <SettingsPage />
      </SyncContext.Provider>,
    );
  });
}

async function mount() {
  const container = Object.assign(new EventTarget(), {
    nodeType: 1,
    tagName: "DIV",
    ownerDocument: new EventTarget(),
  }) as unknown as Element;
  root = createRoot(container);
  await render(syncWith(ME));
}

const shown = () => view.props!.me;

function stubWindow() {
  const tab = new Map<string, string>();
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), {
      HTMLIFrameElement: class {},
      matchMedia: () => ({ matches: false }),
      sessionStorage: {
        getItem: (k: string) => tab.get(k) ?? null,
        setItem: (k: string, v: string) => void tab.set(k, v),
      },
    }),
  );
}

beforeEach(() => {
  events = [];
  bodies = [];
  view.props = null;
  view.toasts.length = 0;
  view.pushed.length = 0;
  patchResponse = () => Response.json({ me: ME });
  travelResponse = () => Response.json({ travelling: true });
  deleteResponse = () => Response.json({ deleted: true });
  searchResponse = () => Response.json({ results: PLACES });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  stubWindow();
  vi.stubGlobal("fetch", vi.fn(fakeFetch));
});

afterEach(async () => {
  await act(async () => root.unmount());
  vi.unstubAllGlobals();
});

describe("/settings saves (ac-2)", () => {
  it("renders the synced me", async () => {
    await mount();
    expect(shown()).toEqual(ME);
  });

  it("sends one PATCH with account for a switch, then refreshes sync", async () => {
    await mount();
    await act(async () => view.props!.onSave({ notifyHungry: true }));
    expect(events).toEqual(["PATCH /api/settings", "refresh"]);
    expect(bodies).toEqual([{ notifyHungry: true, account: "me-1" }]);
  });

  it("sends one PATCH with account for the SMS fallback switch", async () => {
    await mount();
    await act(async () => view.props!.onSave({ smsFallback: true }));
    expect(bodies).toEqual([{ smsFallback: true, account: "me-1" }]);
    expect(events).toEqual(["PATCH /api/settings", "refresh"]);
  });

  it("saves Kilometres, and shows km from the next sync on", async () => {
    await mount();
    await act(async () => view.props!.onSave({ units: "km" }));
    expect(bodies).toEqual([{ units: "km", account: "me-1" }]);
    expect(events).toEqual(["PATCH /api/settings", "refresh"]);
    expect(shown().units).toBe("km");
    await render(syncWith({ ...ME, units: "km" }));
    expect(shown().units).toBe("km");
  });

  it("shows the new value while the save is in flight", async () => {
    let finish: (r: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (url: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((resolve) => {
            void fakeFetch(url, init);
            finish = resolve;
          }),
      ),
    );
    await mount();
    await act(async () => {
      void view.props!.onSave({ notifyDelays: false });
    });
    expect(events).toEqual(["PATCH /api/settings"]);
    expect(shown().settings.notifyDelays).toBe(false);
    await act(async () => finish(Response.json({ me: ME })));
    expect(events).toEqual(["PATCH /api/settings", "refresh"]);
  });

  it("on a failed save, toasts the API's message and shows the synced value", async () => {
    patchResponse = () =>
      Response.json(
        {
          error: {
            code: "conflict",
            message: "Signed in as someone else now.",
          },
        },
        { status: 409 },
      );
    await mount();
    await act(async () => view.props!.onSave({ notifyHungry: true }));
    expect(view.toasts).toEqual(["Signed in as someone else now."]);
    expect(events).toEqual(["PATCH /api/settings"]);
    expect(shown().settings.notifyHungry).toBe(false);
  });

  it("on a failed units save, keeps the synced units", async () => {
    patchResponse = () =>
      Response.json({ error: { message: "Try again." } }, { status: 500 });
    await mount();
    await act(async () => view.props!.onSave({ units: "km" }));
    expect(view.toasts).toEqual(["Try again."]);
    expect(shown().units).toBe("mi");
  });

  it("saves quiet hours in one PATCH and shows them while in flight", async () => {
    let finish: (r: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (url: RequestInfo | URL, init?: RequestInit) =>
          new Promise<Response>((resolve) => {
            void fakeFetch(url, init);
            finish = resolve;
          }),
      ),
    );
    await mount();
    const quiet = { quietOn: true, quietStart: 21, quietEnd: 6 };
    await act(async () => {
      void view.props!.onSave(quiet);
    });
    expect(bodies).toEqual([{ ...quiet, account: "me-1" }]);
    expect(events).toEqual(["PATCH /api/settings"]);
    expect(shown().settings).toMatchObject(quiet);
    await act(async () => finish(Response.json({ me: ME })));
    expect(events).toEqual(["PATCH /api/settings", "refresh"]);
  });

  it("renames with one PATCH, refreshes sync and reports no problem", async () => {
    await mount();
    let result: string | null | undefined;
    await act(async () => {
      result = await view.props!.onRename("Maxine");
    });
    expect(result).toBeNull();
    expect(bodies).toEqual([{ name: "Maxine", account: "me-1" }]);
    expect(events).toEqual(["PATCH /api/settings", "refresh"]);
  });

  it("on a refused name, returns the API's message without a toast", async () => {
    patchResponse = () =>
      Response.json(
        { error: { code: "invalid", message: "name: Invalid input" } },
        { status: 400 },
      );
    await mount();
    let result: string | null | undefined;
    await act(async () => {
      result = await view.props!.onRename("Bad word");
    });
    expect(result).toBe("name: Invalid input");
    expect(view.toasts).toEqual([]);
    expect(events).toEqual(["PATCH /api/settings"]);
    expect(shown().name).toBe("Max");
  });

  it("signs out, then goes to the welcome page", async () => {
    await mount();
    await act(async () => view.props!.onSignOut());
    expect(events).toEqual(["POST /api/auth/sign-out"]);
    expect(view.pushed).toEqual(["/welcome"]);
  });
});

const PLACES = [
  {
    placeId: "0b6a1b4e-4a56-4d8e-9f1c-8f8e5b2b9a10",
    label: "Back Bay",
    sublabel: "Boston, MA",
    kind: "neighbourhood",
  },
];

const HERE = { latitude: 40.712776, longitude: -73.935242 };

function stubGeolocation(fails = false) {
  vi.stubGlobal("navigator", {
    geolocation: {
      getCurrentPosition: (
        ok: (p: { coords: typeof HERE }) => void,
        no: (e: Error) => void,
      ) => (fails ? no(new Error("denied")) : ok({ coords: HERE })),
    },
  });
}

describe("/settings travel (ac-1)", () => {
  it("opens and closes the sheet through the view", async () => {
    await mount();
    expect(view.props!.sheet).toBeNull();
    await act(async () => view.props!.onSheet("travel"));
    expect(view.props!.sheet).toBe("travel");
    await act(async () => view.props!.onSheet(null));
    expect(view.props!.sheet).toBeNull();
  });

  it("turning travel on posts the snapped location, refreshes and closes the sheet", async () => {
    stubGeolocation();
    await mount();
    await act(async () => view.props!.onSheet("travel"));
    await act(async () => view.props!.onTravel(true));
    const point = snap(HERE.latitude, HERE.longitude);
    expect(point).not.toEqual({ lat: HERE.latitude, lon: HERE.longitude });
    expect(bodies).toEqual([{ on: true, lat: point.lat, lon: point.lon }]);
    expect(events).toEqual(["POST /api/loft/travel", "refresh"]);
    expect(view.props!.sheet).toBeNull();
  });

  it("turning travel off posts on false and refreshes", async () => {
    await mount();
    await act(async () => view.props!.onTravel(false));
    expect(bodies).toEqual([{ on: false }]);
    expect(events).toEqual(["POST /api/loft/travel", "refresh"]);
  });

  it("a conflict within 12 hours toasts the API's message and does not refresh", async () => {
    stubGeolocation();
    travelResponse = () =>
      Response.json(
        {
          error: {
            code: "conflict",
            message: "You can change travel again in 12 hours.",
          },
        },
        { status: 409 },
      );
    await mount();
    await act(async () => view.props!.onSheet("travel"));
    await act(async () => view.props!.onTravel(true));
    expect(view.toasts).toEqual(["You can change travel again in 12 hours."]);
    expect(events).toEqual(["POST /api/loft/travel"]);
    expect(view.props!.sheet).toBe("travel");
  });

  it("without a location, toasts and sends nothing", async () => {
    stubGeolocation(true);
    await mount();
    await act(async () => view.props!.onTravel(true));
    expect(view.toasts).toEqual([
      "We could not get your location. Try a search instead.",
    ]);
    expect(events).toEqual([]);
  });

  it("searching shows the places found in the sheet", async () => {
    await mount();
    await act(async () => view.props!.onSheet("travel"));
    expect(view.props!.places).toEqual([]);
    await act(async () => view.props!.onSearch("  back bay "));
    expect(events).toEqual(["GET /api/geo/search?q=back+bay"]);
    expect(view.props!.places).toEqual(PLACES);
  });

  it("a search that finds nothing toasts the API's message", async () => {
    searchResponse = () =>
      Response.json({ results: [], message: "No such place." });
    await mount();
    await act(async () => view.props!.onSheet("travel"));
    await act(async () => view.props!.onSearch("zzz"));
    expect(view.props!.places).toEqual([]);
    expect(view.toasts).toEqual(["No such place."]);
  });

  it("an empty search sends nothing", async () => {
    await mount();
    await act(async () => view.props!.onSearch("   "));
    expect(events).toEqual([]);
  });

  it("with location denied, a picked place still turns travel on, refreshes and closes the sheet", async () => {
    stubGeolocation(true);
    await mount();
    await act(async () => view.props!.onSheet("travel"));
    await act(async () => view.props!.onTravel(true));
    await act(async () => view.props!.onSearch("Back Bay"));
    await act(async () => view.props!.onPlace(PLACES[0].placeId));
    expect(bodies).toEqual([{ on: true, placeId: PLACES[0].placeId }]);
    expect(events).toEqual([
      "GET /api/geo/search?q=Back+Bay",
      "POST /api/loft/travel",
      "refresh",
    ]);
    expect(view.props!.sheet).toBeNull();
    expect(view.props!.places).toEqual([]);
  });

  it("a picked place inside 12 hours toasts the API's conflict and keeps the sheet", async () => {
    travelResponse = () =>
      Response.json(
        {
          error: {
            code: "conflict",
            message: "Travel can only change once every 12 hours.",
          },
        },
        { status: 409 },
      );
    await mount();
    await act(async () => view.props!.onSheet("travel"));
    await act(async () => view.props!.onPlace(PLACES[0].placeId));
    expect(view.toasts).toEqual([
      "Travel can only change once every 12 hours.",
    ]);
    expect(events).toEqual(["POST /api/loft/travel"]);
    expect(view.props!.sheet).toBe("travel");
  });
});

describe("/settings delete my account (ac-2)", () => {
  it("sends the typed handle as confirm, then goes to the welcome page", async () => {
    await mount();
    await act(async () => view.props!.onSheet("delete"));
    await act(async () => view.props!.onDelete("max"));
    expect(events).toEqual(["DELETE /api/account"]);
    expect(bodies).toEqual([{ confirm: "max" }]);
    expect(view.pushed).toEqual(["/welcome"]);
  });

  it("a wrong handle toasts the API's message and stays put", async () => {
    deleteResponse = () =>
      Response.json(
        {
          error: {
            code: "invalid",
            message: "confirm: type your handle to delete",
          },
        },
        { status: 400 },
      );
    await mount();
    await act(async () => view.props!.onSheet("delete"));
    await act(async () => view.props!.onDelete("maxx"));
    expect(bodies).toEqual([{ confirm: "maxx" }]);
    expect(view.toasts).toEqual(["confirm: type your handle to delete"]);
    expect(view.pushed).toEqual([]);
    expect(view.props!.sheet).toBe("delete");
  });
});

describe("/settings home screen install (ac-6)", () => {
  it("detects the platform after mount, and a desktop browser cannot install", async () => {
    await mount();
    expect(view.props!.install.state.kind).toBe("skip");
  });

  it("closes the install guide once the app is installed", async () => {
    await mount();
    await render(syncWith({ ...ME, installed: false }));
    await act(async () => view.props!.onSheet("install"));
    expect(view.props!.sheet).toBe("install");
    await act(async () => window.dispatchEvent(new Event("appinstalled")));
    expect(view.props!.install.state.kind).toBe("done");
    expect(view.props!.sheet).toBeNull();
  });
});

describe("/settings home screen once installed (ac-6)", () => {
  const ANDROID_CHROME =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36";
  const IPHONE_SAFARI =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
  const NOT_INSTALLED = { ...ME, installed: false };

  const onPhone = (userAgent: string) =>
    vi.stubGlobal("navigator", { userAgent, maxTouchPoints: 5 });

  const viewText = async () => {
    const { SettingsView } =
      await vi.importActual<typeof SettingsViewModule>("./SettingsView");
    const html = renderToStaticMarkup(<SettingsView {...view.props!} />);
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  };

  const homeScreenRow = async () =>
    (await viewText()).match(/On your home screen (\w+)/)?.[1];

  const blockedStorage = () =>
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get: () => {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });

  const fullStorage = () =>
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => {
          throw new DOMException(
            "The quota has been exceeded.",
            "QuotaExceededError",
          );
        },
      },
    });

  it("records the install on the profile and still shows Yes after leaving Settings and coming back", async () => {
    onPhone(ANDROID_CHROME);
    await mount();
    await render(syncWith(NOT_INSTALLED));
    expect(await homeScreenRow()).toBe("Install");

    await act(async () => window.dispatchEvent(new Event("appinstalled")));
    expect(await homeScreenRow()).toBe("Yes");
    expect(bodies).toEqual([{ installed: true, account: "me-1" }]);
    expect(events).toEqual(["PATCH /api/settings", "refresh"]);

    await act(async () => root.unmount());
    await mount();
    await render(syncWith(NOT_INSTALLED));
    expect(await homeScreenRow()).toBe("Yes");
    expect(view.props!.install.state.kind).toBe("done");
  });

  it("closes the open guide when sync brings an installed profile", async () => {
    onPhone(IPHONE_SAFARI);
    await mount();
    await render(syncWith(NOT_INSTALLED));
    await act(async () => view.props!.onSheet("install"));
    expect(view.props!.sheet).toBe("install");

    await render(syncWith(ME));
    expect(view.props!.sheet).toBeNull();
    expect(await homeScreenRow()).toBe("Yes");
  });

  it("still renders Settings and Yes for an installed profile when storage is blocked", async () => {
    onPhone(ANDROID_CHROME);
    blockedStorage();
    await mount();
    expect(await viewText()).toContain(" Settings ");
    expect(await homeScreenRow()).toBe("Yes");
    expect(view.props!.install.state.kind).toBe("waiting");
  });

  it("still renders Settings and Yes in standalone mode when the storage write hits the quota", async () => {
    onPhone(ANDROID_CHROME);
    fullStorage();
    window.matchMedia = () => ({ matches: true }) as MediaQueryList;
    await mount();
    await render(syncWith(NOT_INSTALLED));
    expect(await viewText()).toContain(" Settings ");
    expect(await homeScreenRow()).toBe("Yes");
    expect(view.props!.install.state.kind).toBe("done");
    expect(bodies).toEqual([{ installed: true, account: "me-1" }]);
  });
});
