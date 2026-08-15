"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

import { loadPoster } from "./posterTextures";
import { useUniverse } from "./UniverseProvider";
import type { UniverseNode } from "@/lib/universe/data";

/**
 * Films, as posters.
 *
 * The posters *are* the nodes. This is what makes the map unmistakably about
 * cinema rather than a generic point cloud, and it is why a film growing as
 * you approach reads as travel rather than as a zoom control.
 *
 * Two decisions carry the whole component:
 *
 * Posters are **world-space quads of fixed size**, so perspective does the
 * work — a near film is genuinely large and a distant one genuinely tiny,
 * with no distance maths in the sizing at all. Screen-space sizing would have
 * needed a curve per tier and would never have felt physical.
 *
 * Only a **bounded set** exists at once, chosen nearest-first. Eight hundred
 * posters would be a wall of thumbnails — the Pinterest failure — and eight
 * hundred draw calls. The rest of the catalogue remains as points and
 * atmosphere, which is what a poster too small to read should look like
 * anyway.
 */

/** Poster height in world units, against a universe half-extent of 100. */
const POSTER_HEIGHT = 6.2;
const POSTER_ASPECT = 2 / 3;

/** The selected film is the anchor of the composition and is materially larger. */
const SELECTED_SCALE = 2.4;

/** How many posters may exist at once. Desktop; halved on coarse pointers. */
const BUDGET = 80;

/** Beyond this a poster is smaller than a few pixels and not worth a texture. */
const VISIBLE_WITHIN = 300;

/** Re-choosing the visible set every frame is wasteful and looks identical. */
const REFRESH_MS = 140;

export function PosterField({ onEnter }: { onEnter: (id: number) => void }) {
  const { universe, selectedId, byId } = useUniverse();
  const { camera, size } = useThree();

  const [visible, setVisible] = useState<UniverseNode[]>([]);
  const lastRun = useRef(0);

  // Mobile GPUs and smaller screens do not want eighty textured quads.
  const budget = size.width < 768 ? Math.round(BUDGET * 0.45) : BUDGET;

  const positions = useMemo(
    () => new Map(universe.nodes.map((n) => [n.id, new THREE.Vector3(n.x, n.yy, n.z)])),
    [universe.nodes],
  );

  useFrame(({ clock }) => {
    const now = clock.getElapsedTime() * 1000;
    if (now - lastRun.current < REFRESH_MS) return;
    lastRun.current = now;

    const frustum = new THREE.Frustum().setFromProjectionMatrix(
      new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse),
    );

    const candidates: Array<{ node: UniverseNode; distance: number }> = [];
    for (const node of universe.nodes) {
      const position = positions.get(node.id);
      if (!position || !frustum.containsPoint(position)) continue;

      const distance = camera.position.distanceTo(position);
      if (distance > VISIBLE_WITHIN) continue;
      candidates.push({ node, distance });
    }

    candidates.sort((a, b) => a.distance - b.distance);

    /*
     * Spread across the frame, not just nearest-first.
     *
     * Taking the closest eighty films in a 3D cloud takes everything on the
     * side facing the camera, which projects into one clump and leaves the
     * rest of the view empty — and within that clump the posters overlap each
     * other into a collage.
     *
     * So each candidate is projected to screen space and rejected if it would
     * land on top of one already chosen. Nearest-first still wins ties, so the
     * closest film in any part of the frame is the one that gets a poster.
     */
    const halfFov = THREE.MathUtils.degToRad(
      (camera as THREE.PerspectiveCamera).fov / 2,
    );
    const placed: Array<{ x: number; y: number; radius: number }> = [];
    const chosen: UniverseNode[] = [];

    for (const candidate of candidates) {
      if (chosen.length >= budget) break;

      const position = positions.get(candidate.node.id);
      if (!position) continue;

      const ndc = position.clone().project(camera);

      // Half-height in NDC units: world half-height over the view half-height
      // at that depth. Selected films are scaled up and claim proportionally
      // more room.
      const scale = candidate.node.id === selectedId ? SELECTED_SCALE : 1;
      const radius =
        ((POSTER_HEIGHT / 2) * scale) / (candidate.distance * Math.tan(halfFov));

      const collides = placed.some((other) => {
        const dx = other.x - ndc.x;
        // NDC is square while the viewport rarely is, so vertical distance has
        // to be corrected by the aspect ratio or posters overlap on tall screens.
        const dy = (other.y - ndc.y) / (size.width / size.height);
        return Math.hypot(dx, dy) < (other.radius + radius) * 1.15;
      });
      if (collides) continue;

      placed.push({ x: ndc.x, y: ndc.y, radius });
      chosen.push(candidate.node);
    }

    // The selected film keeps its poster regardless of where the budget falls.
    if (selectedId !== null && !chosen.some((n) => n.id === selectedId)) {
      const selected = byId.get(selectedId);
      if (selected) chosen.push(selected);
    }

    // Only re-render when the set actually changes — otherwise every refresh
    // remounts eighty meshes and their fade-ins restart.
    setVisible((current) => {
      if (current.length === chosen.length) {
        const same = current.every((node, i) => node.id === chosen[i].id);
        if (same) return current;
      }
      return chosen;
    });
  });

  return (
    <>
      {visible.map((node) => (
        <Poster
          key={node.id}
          node={node}
          selected={node.id === selectedId}
          dimmed={selectedId !== null && node.id !== selectedId}
          onEnter={onEnter}
        />
      ))}
    </>
  );
}

function Poster({
  node,
  selected,
  dimmed,
  onEnter,
}: {
  node: UniverseNode;
  selected: boolean;
  dimmed: boolean;
  onEnter: (id: number) => void;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const { select } = useUniverse();
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const [hovered, setHovered] = useState(false);

  // The selected poster is the one people actually look at, so it alone gets
  // the larger texture.
  useEffect(() => {
    let alive = true;
    loadPoster(node.p, selected ? "w342" : "w154").then((loaded) => {
      if (alive) setTexture(loaded);
    });
    return () => {
      alive = false;
    };
  }, [node.p, selected]);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    const material = materialRef.current;
    if (!mesh || !material) return;

    // Billboard. Copying the camera's quaternion keeps every poster square to
    // the viewer without the roll that `lookAt` introduces when orbiting.
    mesh.quaternion.copy(state.camera.quaternion);

    const targetScale = selected ? SELECTED_SCALE : hovered ? 1.25 : 1;
    const scale = THREE.MathUtils.damp(mesh.scale.x, targetScale, 6, delta);
    mesh.scale.setScalar(scale);

    // Fade in rather than pop. A poster appearing at full strength as the
    // budget shifts is the single most distracting thing in a moving field.
    const distance = state.camera.position.distanceTo(mesh.position);
    const far = 1 - THREE.MathUtils.smoothstep(distance, VISIBLE_WITHIN * 0.55, VISIBLE_WITHIN);
    const target = (selected ? 1 : dimmed ? 0.45 : 0.9) * far;
    material.opacity = THREE.MathUtils.damp(material.opacity, target, 5, delta);
  });

  if (!texture) return null;

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    if (selected) onEnter(node.id);
    else select(node.id);
  };

  return (
    <mesh
      ref={meshRef}
      position={[node.x, node.yy, node.z]}
      onClick={handleClick}
      onPointerOver={(event) => {
        event.stopPropagation();
        setHovered(true);
      }}
      onPointerOut={() => setHovered(false)}
      renderOrder={selected ? 3 : 2}
    >
      <planeGeometry args={[POSTER_HEIGHT * POSTER_ASPECT, POSTER_HEIGHT]} />
      <meshBasicMaterial
        ref={materialRef}
        map={texture}
        transparent
        opacity={0}
        // Depth writes off so posters never punch holes in the atmosphere they
        // are sitting inside; still depth-tested so nearer films occlude
        // further ones and the space reads as deep.
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}
