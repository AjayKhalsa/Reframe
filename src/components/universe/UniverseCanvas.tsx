"use client";

import { useRouter, usePathname } from "next/navigation";
import { Canvas } from "@react-three/fiber";
import { useCallback } from "react";

import { Aura } from "./Aura";
import { CameraRig } from "./CameraRig";
import { Labels } from "./Labels";
import { Nodes } from "./Nodes";
import { PosterField } from "./PosterField";
import { INITIAL_CAMERA, useUniverse } from "./UniverseProvider";

/**
 * The universe canvas.
 *
 * Mounted once in the root layout and never unmounted. That is deliberate and
 * it is the single most important structural decision in the app: a canvas
 * that lived inside the home page would be torn down on every navigation,
 * destroying the WebGL context, reloading every texture, and resetting the
 * camera. Films render as an overlay *above* this, so returning from one is
 * just the overlay going away — the universe was there the whole time.
 *
 * When a film is open the render loop stops entirely rather than burning GPU
 * on a scene nobody can see.
 */
export function UniverseCanvas() {
  const router = useRouter();
  const pathname = usePathname();
  const { universe } = useUniverse();

  const hidden = pathname !== "/";

  const enter = useCallback(
    (id: number) => {
      router.push(`/movie/${id}`);
    },
    [router],
  );

  if (universe.nodes.length === 0) return null;

  return (
    <div
      className="fixed inset-0 z-0 transition-opacity duration-700"
      style={{
        // Dimmed rather than unmounted, so the film's page has something with
        // depth behind it and the return feels like a camera pulling back.
        opacity: hidden ? 0 : 1,
        pointerEvents: hidden ? "none" : "auto",
        transitionTimingFunction: "var(--ease)",
      }}
      aria-hidden={hidden}
    >
      <Canvas
        // Position comes from INITIAL_CAMERA so the Canvas and the rig that
        // restores it cannot disagree — they did, and the map opened at a
        // different distance than the one the label tiers were tuned against.
        camera={{ fov: 55, near: 0.1, far: 1200, position: INITIAL_CAMERA.position }}
        // Capped rather than uncapped: on a high-refresh display an idle
        // starfield will happily render at 240fps and drain a laptop battery
        // for no visible benefit.
        dpr={[1, 2]}
        frameloop={hidden ? "never" : "always"}
        gl={{ antialias: true, powerPreference: "high-performance" }}
      >
        <CameraRig />
        {/* Atmosphere, then the abstract far field, then the posters that
            emerge from it, then text. Strictly back to front. */}
        <Aura />
        <Nodes onEnter={enter} />
        <PosterField onEnter={enter} />
        <Labels onEnter={enter} />
      </Canvas>
    </div>
  );
}
