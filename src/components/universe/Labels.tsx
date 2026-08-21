"use client";

import { useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Html } from "@react-three/drei";
import * as THREE from "three";

import { useUniverse } from "./UniverseProvider";
import type { UniverseNode } from "@/lib/universe/data";

/**
 * Text and posters, at the distances where they earn their place.
 *
 * The governing rule: **most films are invisible until you are close enough to
 * care about them.** That is not only a rendering constraint, it is what the
 * product is about — you are not meant to read eight hundred titles, you are
 * meant to see a landscape, notice something, and go and look at it.
 *
 * So the tiers are aggressive:
 *
 *   far     nothing at all
 *   medium  a few notable films, as landmarks
 *   near    the films around you
 *   close   posters as well
 *
 * Overlapping labels are *hidden*, never nudged. Repositioning is how you get
 * a pile of fifteen titles jostling in the middle of the screen, which is the
 * single thing that made this read as a data-science demo.
 */

/**
 * Beyond this, no text whatsoever.
 *
 * Set below the default camera distance on purpose: the first thing you see
 * must be pure landscape, with not one word floating in it. Text arrives only
 * once you have chosen to move closer.
 */
const SILENT_BEYOND = 165;
/** Between here and SILENT_BEYOND, only landmarks. */
const LANDMARKS_BEYOND = 95;
/** Budgets per tier. Small on purpose. */
const MAX_LANDMARKS = 4;
const MAX_NEAR = 7;

/**
 * Minimum separation between labels, in projected units.
 *
 * Generous. Wider than tall because titles are wide and short, so horizontal
 * collision is what actually happens.
 */
const GAP_X = 230;
const GAP_Y = 60;

/**
 * Clearance around the selected film.
 *
 * Much larger than a label's, because the selected film occupies a poster and
 * a title rather than a line of text.
 */
const POSTER_GAP_X = 260;
const POSTER_GAP_Y = 210;

/** Recompute at most this often. Every frame is wasteful and looks identical. */
const REFRESH_MS = 130;

export function Labels({ onEnter }: { onEnter: (id: number) => void }) {
  const { universe, selectedId, select, byId } = useUniverse();
  const { camera, size } = useThree();

  const [labels, setLabels] = useState<UniverseNode[]>([]);
  const lastRun = useRef(0);

  const positions = useMemo(
    () => universe.nodes.map((node) => new THREE.Vector3(node.x, node.yy, node.z)),
    [universe.nodes],
  );

  /** The handful of films prominent enough to act as landmarks when far out. */
  const landmarks = useMemo(() => {
    return [...universe.nodes].sort((a, b) => b.v - a.v).slice(0, 60);
  }, [universe.nodes]);

  useFrame(({ clock }) => {
    const now = clock.getElapsedTime() * 1000;
    if (now - lastRun.current < REFRESH_MS) return;
    lastRun.current = now;

    const distance = camera.position.length();

    if (distance > SILENT_BEYOND) {
      if (labels.length) setLabels([]);
      return;
    }

    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );

    const isLandmarkTier = distance > LANDMARKS_BEYOND;
    const pool = isLandmarkTier ? landmarks : universe.nodes;
    const budget = isLandmarkTier ? MAX_LANDMARKS : MAX_NEAR;

    // Candidates: on screen, sorted nearest first.
    const candidates: Array<{ node: UniverseNode; distance: number }> = [];
    for (const node of pool) {
      const position = positions[universe.nodes.indexOf(node)];
      if (!position || !frustum.containsPoint(position)) continue;
      candidates.push({ node, distance: camera.position.distanceTo(position) });
    }
    candidates.sort((a, b) => a.distance - b.distance);

    /*
     * The selected film and its closest neighbours are placed first and are
     * never dropped for collision. Losing the label of the thing you just
     * clicked — or of the neighbourhood you are there to read — would be the
     * one unacceptable outcome of a hide-on-overlap policy.
     */
    const pinned: UniverseNode[] = [];
    if (selectedId !== null) {
      const selected = byId.get(selectedId);
      if (selected) {
        pinned.push(selected);
        for (const id of selected.n.slice(0, 4)) {
          const neighbour = byId.get(id);
          if (neighbour) pinned.push(neighbour);
        }
      }
    }

    const placed: Array<{ x: number; y: number }> = [];
    const chosen: UniverseNode[] = [];

    const project = (node: UniverseNode) => {
      const ndc = new THREE.Vector3(node.x, node.yy, node.z).project(camera);
      return { x: ndc.x * 1000, y: ndc.y * 1000 };
    };

    /*
     * The selected film is placed first and claims a much larger footprint
     * than a label needs, because it is not a label — it is a poster with a
     * title under it.
     *
     * Neighbours are exempt from colliding with *each other* so the
     * neighbourhood always reads, but they are not exempt from colliding with
     * this. Letting them through unconditionally put two titles across the
     * middle of the selected poster. Nothing is lost when one is dropped: the
     * panel lists them all anyway.
     */
    const [selected, ...neighbours] = pinned;

    if (selected) {
      const point = project(selected);
      placed.push(point);
      chosen.push(selected);

      const reserved = { x: point.x, y: point.y };
      for (const node of neighbours) {
        const candidate = project(node);
        const clearsPoster =
          Math.abs(reserved.x - candidate.x) > POSTER_GAP_X ||
          Math.abs(reserved.y - candidate.y) > POSTER_GAP_Y;

        if (!clearsPoster) continue;
        placed.push(candidate);
        chosen.push(node);
      }
    }

    const pinnedIds = new Set(pinned.map((n) => n.id));
    for (const candidate of candidates) {
      if (chosen.length >= budget + pinned.length) break;
      if (pinnedIds.has(candidate.node.id)) continue;

      const point = project(candidate.node);
      const collides = placed.some(
        (p) => Math.abs(p.x - point.x) < GAP_X && Math.abs(p.y - point.y) < GAP_Y,
      );
      if (collides) continue;

      placed.push(point);
      chosen.push(candidate.node);
    }

    setLabels(chosen);
  });

  return (
    <>
      {labels.map((node) => {
        // The mobile information sheet already names the selected film. A
        // second title floating beneath the poster only creates a ghosted,
        // duplicate line behind that sheet.
        if (size.width < 768 && node.id === selectedId) return null;

        return (
          <Label
            key={node.id}
            node={node}
            selected={node.id === selectedId}
            dimmed={selectedId !== null && node.id !== selectedId}
            onSelect={() => (node.id === selectedId ? onEnter(node.id) : select(node.id))}
          />
        );
      })}
    </>
  );
}

function Label({
  node,
  selected,
  dimmed,
  onSelect,
}: {
  node: UniverseNode;
  selected: boolean;
  dimmed: boolean;
  onSelect: () => void;
}) {
  /*
   * Offset below the film, not centred on it.
   *
   * The node's own position is now occupied by its poster quad, so a centred
   * label would sit across the artwork. The drop matches the half-height of
   * the poster — larger for the selected film, whose poster is scaled up.
   */
  const drop = selected ? 8.4 : 4.2;

  return (
    <Html
      position={[node.x, node.yy - drop, node.z]}
      center
      style={{ pointerEvents: "none" }}
      zIndexRange={[20, 0]}
    >
      <button
        type="button"
        onClick={onSelect}
        className="group flex flex-col items-center gap-0.5 select-none"
        // Labels are DOM sitting over a canvas you drag on, so without this a
        // drag selects the text and paints every title with the accent-coloured
        // selection highlight.
        style={{ pointerEvents: "auto", WebkitUserSelect: "none", userSelect: "none" }}
      >
        <span
          className="whitespace-nowrap transition-colors duration-500"
          style={{
            fontSize: selected ? "0.9375rem" : "0.6875rem",
            fontFamily: selected ? "var(--font-serif)" : "var(--font-sans)",
            letterSpacing: selected ? "0" : "0.04em",
            color: selected
              ? "var(--text)"
              : `rgb(var(--text-rgb) / ${dimmed ? 0.42 : 0.6})`,
            textShadow: "0 1px 8px rgb(0 0 0 / 0.95)",
          }}
        >
          {node.t}
          {selected && node.y && (
            <span style={{ color: "rgb(var(--text-rgb) / 0.45)" }}> {node.y}</span>
          )}
        </span>
      </button>
    </Html>
  );
}
