"use client";

import { useEffect, useReducer } from "react";
import type { Dispatch, FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  finishLinkSignUp,
  linkRoost,
  pendingLink,
} from "@/app/(public)/b/[slug]/linkSignUp";
import { takeReturn } from "@/app/(public)/join/returnTo";
import {
  initialLoft,
  loft,
  lookHere,
  NO_LOCATION,
  position,
  saveLoft,
  searchPlaces,
  townCentre,
  type LoftAction,
  type LoftState,
} from "./roost";
import { RoostMap } from "./RoostMap";
import styles from "./page.module.css";

type Actions = {
  locate: () => Promise<void>;
  search: () => Promise<void>;
  pick: (placeId: string) => Promise<void>;
  townCentre: () => Promise<void>;
  home: () => Promise<void>;
};

function useActions(state: LoftState, dispatch: Dispatch<LoftAction>): Actions {
  const router = useRouter();
  const fail = (message: string) => dispatch({ type: "failed", message });

  return {
    async locate() {
      dispatch({ type: "busy" });
      const point = await position().catch(() => null);
      if (!point) return fail(NO_LOCATION);
      const here = await lookHere(point);
      if (!here.ok) return fail(here.message);
      const { place, message } = here.data;
      if (!place) return fail(message ?? NO_LOCATION);
      dispatch({
        type: "located",
        roost: { ...point, ...place },
        pending: point,
      });
    },
    async search() {
      const q = state.query.trim();
      if (!q) return;
      dispatch({ type: "busy" });
      const found = await searchPlaces(q);
      if (!found.ok) return fail(found.message);
      dispatch({ type: "results", results: found.data.results });
      if (found.data.message) fail(found.data.message);
    },
    async pick(placeId) {
      dispatch({ type: "busy" });
      const saved = await saveLoft({ placeId });
      if (!saved.ok) return fail(saved.message);
      dispatch({ type: "located", roost: saved.data, pending: null });
    },
    async townCentre() {
      const { roost } = state;
      if (!roost?.city) return;
      dispatch({ type: "busy" });
      const saved = await townCentre(roost);
      if (!saved.ok) return fail(saved.message);
      dispatch({ type: "located", roost: saved.data, pending: null });
    },
    async home() {
      if (state.pending) {
        dispatch({ type: "busy" });
        const saved = await saveLoft(state.pending);
        if (!saved.ok) return fail(saved.message);
      }
      const finished = await finishLinkSignUp();
      if (finished.kind === "retry") return fail(finished.message);
      router.push(finished.kind === "go" ? finished.to : (takeReturn() ?? "/"));
    },
  };
}

const FROM_LINK = "Is this where birds should find you?";

export function LoftForm({
  state,
  dispatch,
  actions,
}: {
  state: LoftState;
  dispatch: Dispatch<LoftAction>;
  actions: Actions;
}) {
  const { roost, busy } = state;
  const fromLink = roost !== null && roost === state.linked;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!busy) void actions.home();
  };
  const search = (e: FormEvent) => {
    e.preventDefault();
    if (!busy) void actions.search();
  };

  return (
    <div className={styles.body} aria-busy={busy}>
      <button
        type="button"
        className={styles.locate}
        disabled={busy}
        onClick={() => void actions.locate()}
      >
        Use my location
      </button>

      <form role="search" className={styles.field} onSubmit={search}>
        <label htmlFor="loft-search" className={styles.label}>
          Search a neighbourhood
        </label>
        <input
          type="search"
          id="loft-search"
          enterKeyHint="search"
          autoComplete="off"
          className={styles.search}
          placeholder="Williamsburg, Brooklyn"
          value={state.query}
          onChange={(e) => dispatch({ type: "query", query: e.target.value })}
        />
      </form>

      {state.results.length > 0 && (
        <ul className={styles.results}>
          {state.results.map((r) => (
            <li key={r.placeId}>
              <button
                type="button"
                className={styles.result}
                disabled={busy}
                onClick={() => void actions.pick(r.placeId)}
              >
                <span className={styles.resultLabel}>{r.label}</span>
                <span className={styles.resultSub}>{r.sublabel}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {state.error !== null && (
        <div className={styles.toast} role="alert">
          <p>{state.error}</p>
          <button
            type="button"
            className={styles.toastClose}
            aria-label="Dismiss"
            onClick={() => dispatch({ type: "dismiss" })}
          >
            OK
          </button>
        </div>
      )}

      {roost && (
        <form className={styles.preview} onSubmit={submit}>
          {fromLink && <p className={styles.note}>{FROM_LINK}</p>}
          <p className={styles.roost} aria-live="polite">
            {`Your roost: ${[roost.label, roost.city].filter(Boolean).join(", ")}`}
          </p>
          <RoostMap key={`${roost.lat},${roost.lon}`} roost={roost} />
          <p className={styles.note}>We keep the roost, not your address.</p>
          <div className={styles.footer}>
            {roost.city && (
              <button
                type="button"
                className={styles.link}
                disabled={busy}
                onClick={() => void actions.townCentre()}
              >
                Use my town centre instead
              </button>
            )}
            <button type="submit" className={styles.home} disabled={busy}>
              This is home
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export function Loft() {
  const [state, dispatch] = useReducer(loft, undefined, initialLoft);
  const actions = useActions(state, dispatch);
  useEffect(() => {
    const link = pendingLink();
    if (!link) return;
    void linkRoost(link.token).then(
      (roost) => roost && dispatch({ type: "linked", roost }),
    );
  }, []);
  return <LoftForm state={state} dispatch={dispatch} actions={actions} />;
}
