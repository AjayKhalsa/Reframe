"use client";

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

import { genreColour } from "@/lib/universe/genreColour";
import { softSprite } from "./softSprite";
import { useUniverse } from "./UniverseProvider";

/**
 * Every film in the catalogue, as one draw call.
 *
 * Points, not meshes and not DOM. Eight hundred nodes as separate objects
 * would be eight hundred draw calls; as a single `THREE.Points` with
 * per-vertex attributes it is one, and the same holds at ten thousand.
 *
 * The important design decision here is that the universe is mostly *quiet*.
 * Nothing glows by default. Films differ in size and brightness only enough to
 * give the eye somewhere to rest, and when a film is selected everything
 * unrelated recedes rather than the selection merely getting brighter —
 * subtraction reads as focus far better than addition does.
 */

/**
 * Beyond this the field has faded out entirely.
 *
 * Closer than the atmosphere's own range on purpose: at long distance you
 * should be seeing regions of colour with almost no individual films in them.
 */
const FAR = 560;

const vertexShader = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  attribute float aEmphasis;

  uniform float uDimming;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vEmphasis;

  void main() {
    vColor = aColor;
    vEmphasis = aEmphasis;

    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    float distance = -mvPosition.z;

    // Emphasis grows a node a little; it does not turn it into a beacon.
    float size = aSize * (1.0 + aEmphasis * 1.4) * (300.0 / max(distance, 1.0));
    gl_PointSize = clamp(size, 0.9, 30.0);

    /*
     * Depth, and knowing your place.
     *
     * Films are secondary. The atmosphere is what the eye should land on
     * first, so distant films fade hard and early — most of the catalogue at
     * any moment should be barely-there texture inside a region rather than a
     * field of stars competing with it. Only as you approach do they resolve
     * into things you could click.
     */
    float depthFade = 1.0 - smoothstep(FAR_START, FAR_END, distance);
    depthFade *= depthFade;

    // Films close to the camera resolve; the rest stay present as texture.
    // The floor is high because the catalogue disappearing into the atmosphere
    // is as wrong as a starfield — the colour has to look like it is *made of*
    // films.
    float presence = 0.56 + 0.30 * (1.0 - smoothstep(50.0, 210.0, distance));

    // When something is selected, unrelated films step back further.
    float dim = mix(1.0, 0.10 + aEmphasis * 0.90, uDimming);

    // Emphasised films are exempt from the general quieting, or the selected
    // neighbourhood would disappear along with everything else.
    float base = mix(presence, 1.0, aEmphasis);

    vAlpha = depthFade * base * dim;

    gl_Position = projectionMatrix * mvPosition;
  }
`
  .replace("FAR_START", (FAR * 0.35).toFixed(1))
  .replace("FAR_END", FAR.toFixed(1));

const fragmentShader = /* glsl */ `
  uniform sampler2D uSprite;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vEmphasis;

  void main() {
    float sprite = texture2D(uSprite, gl_PointCoord).a;

    // The selected film gets a hard little core inside its soft body, which is
    // what makes it findable at a glance without a ring or a marker.
    vec2 offset = gl_PointCoord - vec2(0.5);
    float core = vEmphasis > 0.9 ? (1.0 - smoothstep(0.0, 0.14, length(offset))) : 0.0;

    vec3 colour = mix(vColor, vec3(1.0), core * 0.9);
    float alpha = clamp(sprite * 1.3 + core, 0.0, 1.0) * vAlpha;

    if (alpha < 0.004) discard;
    gl_FragColor = vec4(colour, alpha);
  }
`;

/**
 * Film tint.
 *
 * The film's own genre colour, lifted toward white so the point still reads as
 * a bright object rather than a coloured smudge. Its aura carries the
 * saturated version of the same hue, so a point and its field are visibly the
 * same film — which is what makes the layers cohere instead of looking like
 * dots laid over unrelated clouds.
 */
function filmColour(genres: string[]): THREE.Color {
  return genreColour(genres).clone().lerp(new THREE.Color(1, 1, 1), 0.55);
}

export function Nodes({ onEnter }: { onEnter: (id: number) => void }) {
  const { universe, selectedId, select, byId } = useUniverse();
  const pointsRef = useRef<THREE.Points>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const { camera } = useThree();

  const nodes = universe.nodes;

  const geometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    const count = nodes.length;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const emphasis = new Float32Array(count);

    // Vote count spans orders of magnitude, so prominence is its logarithm —
    // otherwise a handful of blockbusters are enormous and everything else is
    // an identical speck.
    const maxVotes = Math.max(...nodes.map((n) => n.v), 1);

    nodes.forEach((node, i) => {
      positions[i * 3] = node.x;
      positions[i * 3 + 1] = node.yy;
      positions[i * 3 + 2] = node.z;

      const colour = filmColour(node.g ?? []);
      colors[i * 3] = colour.r;
      colors[i * 3 + 1] = colour.g;
      colors[i * 3 + 2] = colour.b;

      const prominence = Math.log10(node.v + 10) / Math.log10(maxVotes + 10);
      sizes[i] = 2.1 + prominence * 4.4;
      emphasis[i] = 0;
    });

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aEmphasis", new THREE.BufferAttribute(emphasis, 1));

    return geometry;
  }, [nodes]);

  const indexById = useMemo(
    () => new Map(nodes.map((node, index) => [node.id, index])),
    [nodes],
  );

  // Emphasis is written straight into the attribute buffer rather than
  // rebuilding geometry, so selecting a film costs a handful of floats.
  useEffect(() => {
    const attribute = geometry.getAttribute("aEmphasis") as THREE.BufferAttribute;
    const values = attribute.array as Float32Array;
    values.fill(0);

    if (selectedId !== null) {
      const index = indexById.get(selectedId);
      if (index !== undefined) values[index] = 1;

      // Neighbours stay lit while everything else dims. This is what turns a
      // selected point into a visible neighbourhood — the actual product.
      for (const neighbourId of byId.get(selectedId)?.n ?? []) {
        const neighbourIndex = indexById.get(neighbourId);
        if (neighbourIndex !== undefined) values[neighbourIndex] = 0.6;
      }
    }
    attribute.needsUpdate = true;
  }, [selectedId, geometry, indexById, byId]);

  // Declared once and never touched again from React's side. The per-frame
  // value is written through the material ref below, which keeps the mutation
  // out of render entirely.
  const uniforms = useMemo(
    () => ({ uSprite: { value: softSprite() }, uDimming: { value: 0 } }),
    [],
  );

  useFrame((_, delta) => {
    // Ease the dimming rather than switching it, so selecting a film reads as
    // the room quieting down instead of a state change.
    const dimming = materialRef.current?.uniforms.uDimming;
    if (dimming) {
      const target = selectedId === null ? 0 : 1;
      dimming.value = THREE.MathUtils.damp(dimming.value, target, 4, delta);
    }

    // Raycasting against points needs a world-space threshold, and the right
    // one depends on distance — fixed values make far nodes unhittable and
    // near ones grabby.
    const points = pointsRef.current;
    if (points) {
      const distance = camera.position.length();
      points.userData.threshold = THREE.MathUtils.clamp(distance * 0.014, 0.7, 5);
    }
  });

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    const index = event.index;
    if (index === undefined) return;
    event.stopPropagation();

    const node = nodes[index];
    if (!node) return;

    // Clicking the already-selected film enters it; the first click selects.
    if (node.id === selectedId) onEnter(node.id);
    else select(node.id);
  };

  if (nodes.length === 0) return null;

  // No `onPointerMissed` deselect. It fires for clicks that never touched the
  // canvas — including the search dropdown — so selecting a film by search
  // would clear itself a moment later.
  return (
    <points ref={pointsRef} geometry={geometry} onClick={handleClick}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
