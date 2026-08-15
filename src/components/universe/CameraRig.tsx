"use client";

import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

import { INITIAL_CAMERA, useUniverse } from "./UniverseProvider";

/**
 * The camera, and how it travels.
 *
 * Two jobs. It records where the camera is on every frame so leaving and
 * returning to the universe restores the exact view, and it flies to a film
 * when search or a neighbour link asks it to.
 *
 * Flight is an eased interpolation rather than a physics spring: a spring
 * overshoots, and overshooting past a film you were asked to be taken to reads
 * as the camera missing rather than arriving.
 */

/**
 * How close the camera settles to the film it flies to.
 *
 * Far enough back that the neighbourhood is in frame around the film rather
 * than the film filling the view — arriving right on top of one leaves you
 * looking at a poster in the dark with no sense of where you are.
 */
const ARRIVAL_DISTANCE = 40;
/** Below this the flight is considered finished. */
const ARRIVAL_EPSILON = 0.6;
/** Fraction of the remaining distance covered per frame at 60fps. */
const FLIGHT_EASING = 0.055;

export function CameraRig() {
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const { cameraRef, byId, flyToId, arrived, resetToken } = useUniverse();
  const { camera: threeCamera } = useThree();

  const destination = useRef<{ position: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  // Restore the view we left with. Runs once, before the first frame is shown,
  // so returning from a film never shows the default view first.
  //
  // `controls.update()` is what commits the change: OrbitControls keeps its own
  // spherical coordinates internally, and without this call it recomputes from
  // its stale state on the next frame and quietly drags the camera back.
  useEffect(() => {
    const saved = cameraRef.current;
    threeCamera.position.set(...saved.position);
    controlsRef.current?.target.set(...saved.target);
    controlsRef.current?.update();
    // Intentionally mount-only: this restores a snapshot, it does not follow it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Return to the default framing on request.
  useEffect(() => {
    if (resetToken === 0) return;
    destination.current = {
      position: new THREE.Vector3(...INITIAL_CAMERA.position),
      target: new THREE.Vector3(...INITIAL_CAMERA.target),
    };
  }, [resetToken]);

  // Plot a course when asked to travel somewhere.
  useEffect(() => {
    if (flyToId === null) return;
    const node = byId.get(flyToId);
    if (!node) {
      arrived();
      return;
    }

    const target = new THREE.Vector3(node.x, node.yy, node.z);

    // Approach from wherever the camera already is, so a short hop between
    // neighbours stays a short hop instead of swinging around the film.
    const approach = new THREE.Vector3()
      .subVectors(threeCamera.position, target)
      .normalize();

    // Degenerate only if the camera is exactly on the node; any direction will do.
    if (approach.lengthSq() < 1e-6) approach.set(0, 0, 1);

    destination.current = {
      position: target.clone().addScaledVector(approach, ARRIVAL_DISTANCE),
      target,
    };
  }, [flyToId, byId, arrived, threeCamera]);

  useFrame(() => {
    const controls = controlsRef.current;
    if (!controls) return;

    if (destination.current) {
      threeCamera.position.lerp(destination.current.position, FLIGHT_EASING);
      controls.target.lerp(destination.current.target, FLIGHT_EASING);
      controls.update();

      if (threeCamera.position.distanceTo(destination.current.position) < ARRIVAL_EPSILON) {
        destination.current = null;
        arrived();
      }
    }

    // Record the view every frame. Written to a ref rather than state so this
    // costs nothing — nothing renders from it until the universe remounts.
    cameraRef.current = {
      position: threeCamera.position.toArray(),
      target: controls.target.toArray(),
    };
  });

  return (
    <OrbitControls
      ref={controlsRef}
      // Damping is what makes this feel like moving a camera rather than
      // dragging a DOM element.
      enableDamping
      dampingFactor={0.075}
      rotateSpeed={0.42}
      zoomSpeed={0.7}
      // Panning off-axis in a point cloud loses people immediately: there is
      // no horizon to recover against. Orbit and zoom only.
      enablePan={false}
      minDistance={12}
      maxDistance={340}
      makeDefault
    />
  );
}
