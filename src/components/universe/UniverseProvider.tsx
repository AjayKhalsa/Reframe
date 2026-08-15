"use client";

import { createContext, useContext, useMemo, useRef, useState } from "react";
import type { Vector3Tuple } from "three";

import type { Universe, UniverseNode } from "@/lib/universe/data";

/**
 * The universe's persistent state.
 *
 * Lives in the root layout, above the router, which is the whole point: the
 * brief requires that leaving a film returns you to the exact camera position,
 * zoom and selection you left. If this lived in the page it would be recreated
 * on every navigation and the universe would reset each time — the difference
 * between a place and a screen.
 */

export type CameraState = {
  /** Where the camera is. */
  position: Vector3Tuple;
  /** What it is looking at. */
  target: Vector3Tuple;
};

/**
 * The default framing.
 *
 * Far enough out that the whole map is in view and no labels are shown — the
 * first thing you see is landscape, not text.
 */
export const INITIAL_CAMERA: CameraState = { position: [0, 0, 240], target: [0, 0, 0] };

type UniverseContextValue = {
  universe: Universe;
  byId: Map<number, UniverseNode>;

  /** Currently focused film, if any. */
  selectedId: number | null;
  select: (id: number | null) => void;

  /** A film the camera has been asked to travel to. Cleared once it arrives. */
  flyToId: number | null;
  flyTo: (id: number) => void;
  arrived: () => void;

  /**
   * Increments to request a return to the default framing.
   *
   * A counter rather than a boolean so pressing reset twice in a row works —
   * with a flag the second press would be a no-op because the value never
   * changed.
   */
  resetToken: number;
  resetView: () => void;

  /**
   * Live camera state.
   *
   * A ref, not state: the camera changes every frame while the user is
   * dragging, and routing that through React would re-render the tree sixty
   * times a second for a value nothing renders.
   */
  cameraRef: React.RefObject<CameraState>;
};

const UniverseContext = createContext<UniverseContextValue | null>(null);

export function UniverseProvider({
  universe,
  children,
}: {
  universe: Universe;
  children: React.ReactNode;
}) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [flyToId, setFlyToId] = useState<number | null>(null);
  const [resetToken, setResetToken] = useState(0);
  const cameraRef = useRef<CameraState>(INITIAL_CAMERA);

  const byId = useMemo(
    () => new Map(universe.nodes.map((node) => [node.id, node])),
    [universe],
  );

  const value = useMemo<UniverseContextValue>(
    () => ({
      universe,
      byId,
      selectedId,
      select: setSelectedId,
      flyToId,
      flyTo: (id: number) => {
        setSelectedId(id);
        setFlyToId(id);
      },
      arrived: () => setFlyToId(null),
      resetToken,
      resetView: () => {
        setSelectedId(null);
        setFlyToId(null);
        setResetToken((token) => token + 1);
      },
      cameraRef,
    }),
    [universe, byId, selectedId, flyToId, resetToken],
  );

  return <UniverseContext.Provider value={value}>{children}</UniverseContext.Provider>;
}

export function useUniverse(): UniverseContextValue {
  const context = useContext(UniverseContext);
  if (!context) throw new Error("useUniverse must be used inside <UniverseProvider>");
  return context;
}
