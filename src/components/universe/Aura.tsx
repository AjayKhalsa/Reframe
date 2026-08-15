"use client";

import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

import { genreColour } from "@/lib/universe/genreColour";
import { softSprite } from "./softSprite";
import { useUniverse } from "./UniverseProvider";

/**
 * Every film's atmosphere.
 *
 * The most important visual layer in the product, and the one that took the
 * longest to get right. Earlier versions built the atmosphere from cluster
 * *centroids* — which meant inventing twenty-four blobs and laying them over
 * the data. This is the opposite: each film emits its own coloured field, and
 * neighbourhoods appear wherever those fields overlap.
 *
 * That inversion matters for more than tidiness. Regions now come from the
 * embedding itself, so a dense pocket of related crime films genuinely glows
 * amber, edges between regions genuinely blend, and nothing is a hard circle
 * because nothing was ever drawn as one.
 *
 * Colour is genre; intensity is prominence; the sum is a landscape.
 */

/*
 * Sizes below are in *screen pixels at a camera distance of 300*, not world
 * units — see the vertex shader. Getting that wrong is what kept the
 * atmosphere looking like confetti: a value of 26 sounds generous against a
 * universe half-extent of 100, but it renders as a 32-pixel dot on an
 * 800-pixel canvas. Fields have to be measured in the space they are seen in.
 */

/**
 * Two tiers, because one cannot do both jobs.
 *
 * The broad tier is what makes the map colourful at a glance — hundreds of
 * these overlap into the large sweeping regions that give the universe its
 * geography. The local tier keeps each film individually present inside its
 * region, so the colour is clearly made *of* films rather than painted behind
 * them.
 */
const BROAD_SIZE = 120;
const LOCAL_SIZE = 46;

/** Peak opacity per sprite. They stack in the hundreds, so these stay low. */
const BROAD_OPACITY = 0.062;
const LOCAL_OPACITY = 0.24;

/** On-screen size ceilings, so approaching a field concentrates it rather than thinning it. */
const BROAD_MAX_PIXELS = 760;
const LOCAL_MAX_PIXELS = 200;

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute float aMaxSize;
  attribute vec3 aColor;
  attribute float aOpacity;

  uniform float uDimming;

  varying vec3 vColor;
  varying float vOpacity;

  void main() {
    vColor = aColor;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float distance = -mvPosition.z;

    /*
     * Clamped, per tier.
     *
     * A point sprite grows as 1/distance, and a soft sprite spread over five
     * hundred pixels has its energy diluted across all of them — which is why
     * flying close to a film used to land you in near-black despite being
     * surrounded by atmosphere. Capping keeps a field concentrated as you
     * approach instead of thinning into nothing, and stops a broad field
     * passing the camera from washing the screen with one flat disc.
     */
    gl_PointSize = min(aSize * (300.0 / max(distance, 1.0)), aMaxSize);

    /*
     * Atmosphere as a function of approach.
     *
     * Present at the overview — the map must be legible and colourful the
     * instant it loads, not a black rectangle that rewards patience. It
     * intensifies as you close on a region, then eases back once you are
     * inside it so individual films can emerge from the field rather than
     * drowning in it.
     */
    float approach = smoothstep(760.0, 200.0, distance);

    // Eases back when you are inside a region so films can emerge from the
    // field — but only part way. Dropping it further left a selected film
    // sitting in plain black, which loses the whole point: a film should
    // always be seen within its own colour.
    float clearing = 0.86 + 0.14 * smoothstep(24.0, 120.0, distance);

    vOpacity = aOpacity * approach * clearing * uDimming;

    gl_Position = projectionMatrix * mvPosition;
  }
`;

const fragmentShader = /* glsl */ `
  uniform sampler2D uSprite;

  varying vec3 vColor;
  varying float vOpacity;

  void main() {
    float alpha = texture2D(uSprite, gl_PointCoord).a * vOpacity;
    if (alpha < 0.002) discard;

    // Premultiplied, because the screen blend below expects it.
    gl_FragColor = vec4(vColor * alpha, 1.0);
  }
`;

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function Aura() {
  const { universe, selectedId } = useUniverse();
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  const geometry = useMemo(() => {
    const nodes = universe.nodes;
    if (nodes.length === 0) return null;

    const random = mulberry32(0xa17a);
    const maxVotes = Math.max(...nodes.map((n) => n.v), 1);

    // Two sprites per film: one broad, one local.
    const count = nodes.length * 2;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const maxSizes = new Float32Array(count);
    const opacities = new Float32Array(count);

    let cursor = 0;
    const emit = (
      x: number,
      y: number,
      z: number,
      colour: THREE.Color,
      size: number,
      maxSize: number,
      opacity: number,
    ) => {
      positions[cursor * 3] = x;
      positions[cursor * 3 + 1] = y;
      positions[cursor * 3 + 2] = z;
      colors[cursor * 3] = colour.r;
      colors[cursor * 3 + 1] = colour.g;
      colors[cursor * 3 + 2] = colour.b;
      sizes[cursor] = size;
      maxSizes[cursor] = maxSize;
      opacities[cursor] = opacity;
      cursor++;
    };

    nodes.forEach((node) => {
      const colour = genreColour(node.g ?? []);

      // Better-known films cast a wider field, so the map has weight to it —
      // the places you have heard of are the places that look like somewhere.
      const prominence = Math.log10(node.v + 10) / Math.log10(maxVotes + 10);

      /*
       * Offset the broad field well off its film.
       *
       * Two reasons. Perfectly concentric fields produce visible rings where
       * they stack, and at the outer boundary of the cloud — where sprites
       * stop overlapping — each one shows its own circular edge, scalloping
       * the whole universe like a cartoon cloud. Scattering them widely means
       * the boundary is made of many offset falloffs rather than a ring of
       * discs.
       */
      const wobble = (scale: number) => (random() + random() - 1) * scale;

      emit(
        node.x + wobble(38),
        node.yy + wobble(38),
        node.z + wobble(38),
        colour,
        BROAD_SIZE * (0.6 + prominence * 1.1) * (0.75 + random() * 0.6),
        BROAD_MAX_PIXELS,
        BROAD_OPACITY * (0.5 + prominence * 0.9),
      );

      emit(
        node.x,
        node.yy,
        node.z,
        colour,
        LOCAL_SIZE * (0.7 + prominence * 0.8),
        LOCAL_MAX_PIXELS,
        LOCAL_OPACITY * (0.55 + prominence * 0.8),
      );
    });

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aMaxSize", new THREE.BufferAttribute(maxSizes, 1));
    geometry.setAttribute("aOpacity", new THREE.BufferAttribute(opacities, 1));
    return geometry;
  }, [universe]);

  const uniforms = useMemo(
    () => ({ uSprite: { value: softSprite() }, uDimming: { value: 1 } }),
    [],
  );

  useFrame((_, delta) => {
    // The whole field settles when a film is selected, so the chosen
    // neighbourhood reads clearly against a calmer background.
    const dimming = materialRef.current?.uniforms.uDimming;
    if (dimming) {
      const target = selectedId === null ? 1 : 0.55;
      dimming.value = THREE.MathUtils.damp(dimming.value, target, 3, delta);
    }
  });

  if (!geometry) return null;

  return (
    <points geometry={geometry} frustumCulled={false} renderOrder={-1}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        depthTest={false}
        /*
         * Screen, not additive.
         *
         * Additive sums, so in a dense region fifty overlapping fields add up
         * well past 1.0 and clip to flat white — the colour is destroyed
         * exactly where there is most of it, which turned the map into a
         * rainbow nebula. Screen (`1 - (1-a)(1-b)`) accumulates the same way
         * but asymptotes toward white instead of hitting it, so dense regions
         * become deeply saturated rather than blown out.
         */
        blending={THREE.CustomBlending}
        blendEquation={THREE.AddEquation}
        blendSrc={THREE.OneMinusDstColorFactor}
        blendDst={THREE.OneFactor}
      />
    </points>
  );
}
