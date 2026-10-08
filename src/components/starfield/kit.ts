/** What the panels share: the game store, the engine, and a per-frame paint for the readouts. */

import { createContext, useContext, useEffect, useRef } from "react";
import { useStore } from "zustand";
import type { StarfieldEngine } from "@/components/starfield/engine";
import { type Game, type GameActions, type GameStore, createGameStore } from "@/components/starfield/store";
import type { StarfieldHooks } from "@/components/starfield/types";

export type FrameSnap = Parameters<StarfieldHooks["onFrame"]>[0];
type Painter = (snap: FrameSnap) => void;

export type GameKit = {
  store: GameStore;
  engine: { current: StarfieldEngine | null };
  stage: { current: HTMLElement | null };
  /** Where the ship is, as of the last frame. */
  shipAt: { current: { x: number; z: number } };
  /** Each frame calls these. Readouts change every frame, so they skip React and write the DOM. */
  painters: Set<Painter>;
};

export function createGameKit(): GameKit {
  return {
    store: createGameStore(),
    engine: { current: null },
    stage: { current: null },
    shipAt: { current: { x: 0, z: 0 } },
    painters: new Set(),
  };
}

export const GameContext = createContext<GameKit | null>(null);

export function useKit(): GameKit {
  const kit = useContext(GameContext);
  if (!kit) throw new Error("Starward panels need a GameContext");
  return kit;
}

/** Reads from the store and re-renders when the selected value changes. */
export function useGame<T>(selector: (game: Game) => T): T {
  return useStore(useKit().store, selector);
}

/** The store's actions. They never change, so reading them does not subscribe. */
export function useActions(): GameActions {
  return useKit().store.getState();
}

/** Runs `paint` every frame with what the engine reports. Always the latest render's `paint`. */
export function usePainter(paint: Painter): void {
  const { painters } = useKit();
  const latest = useRef(paint);
  latest.current = paint;
  useEffect(() => {
    const run: Painter = (snap) => latest.current(snap);
    painters.add(run);
    return () => {
      painters.delete(run);
    };
  }, [painters]);
}
