import {
  BufferAttribute,
  Color,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedBufferGeometry,
  Mesh,
  MeshStandardMaterial,
  Vector2,
  Vector3,
  Vector4,
} from 'three';
import { QualitySettings } from '@engine/capability.service';
import { disposeObject3D } from '@engine/dispose';
import { WorldContext, WorldObject } from '@engine/world-object';
import { Exclusion } from './scatter';
import { withAtmosphere } from './shaders/atmosphere';
import { patchMaterial } from './shaders/patch';
import { SharedUniforms } from './shaders/shared-uniforms';
import { WIND_GLSL } from './shaders/wind';

export interface GrassOptions {
  readonly shared: SharedUniforms;
  /** GLSL defining `float terrainHeight(vec2 p)` for `p = (world x, world z)`. */
  readonly heightGlsl: string;
  /** Metres of grass around the camera. */
  readonly radius: number;
  /** Blades on the high tier; the other tiers scale it down (see `bladeCount`). */
  readonly blades: number;
  /** Blade height at scale 1, metres. */
  readonly height: number;
  /** sRGB hex: the blade's colour at the root, at the tip, and where a patch has dried out. */
  readonly colours: { readonly root: number; readonly tip: number; readonly dry: number };
  /** No grass here, evaluated in the vertex shader; at most 16 circles, 4 rings, 8 segments, 4 arcs. */
  readonly bare: readonly Exclusion[];
}

/** A spot of bare ground known only once the scene has placed its landmarks. */
export interface Clearing {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

/**
 * Uniform array sizes. Every blade tests every zone in the vertex shader, so the lists are short
 * and fixed; a world that needs more should carve its paths into the ground colour instead.
 */
const LIMITS = { circle: 16, ring: 4, segment: 8, arc: 4 } as const;

/** Metres over which a blade grows back from nothing at the edge of a bare zone. */
const BORDER_METRES = 0.6;

/**
 * Share of `blades` each `shaderDetail` tier draws, and how far out it draws them. The low tier
 * keeps 8 % of the blades on half the radius: fewer, wider blades near the visitor read as a
 * meadow, while the same few spread over the full circle would read as stubble.
 */
const TIER_BLADES: readonly [number, number, number] = [0.08, 0.6, 1];
const TIER_RADIUS: readonly [number, number, number] = [0.5, 1, 1];

/**
 * A blade is never broader than this, however sparse the grid: the low tier's cells are 35 cm and
 * a blade a tenth of that wide read as a leaf, not grass.
 */
const MAX_HALF_WIDTH = 0.028;

/**
 * Where the blades start shrinking towards the edge of the field, as a share of the radius. A
 * short fade left a visible ring; from here the blades thin over the outer half of the circle,
 * where they are a few pixels tall anyway, and the ground's face colours take over underneath.
 */
const FADE_FROM = 0.5;

/**
 * Blades along one side of a tuft, the unit that is instanced. One instance per blade is the
 * obvious layout and a trap: SwiftShader runs every instance through the pipeline on its own, so
 * nine thousand seven-vertex instances cost over 100 ms a frame whatever the shader does, and a
 * real GPU dislikes instances that small too. A tuft of 8 × 8 blades cuts the instance count by
 * 64 and leaves the wrap-around working at tuft granularity, well inside the distance fade.
 */
const TUFT_SIDE = 8;
const BLADES_PER_TUFT = TUFT_SIDE * TUFT_SIDE;

/** Vertices and triangles in one blade: three pairs up the blade and the tip. */
const BLADE_VERTICES = 7;
const BLADE_INDICES = 15;

/** Blade half-width as a share of the blade cell: the sparser the grid, the broader the blade. */
const HALF_WIDTH_OF_CELL = 0.1;

/**
 * A meadow of wind-blown grass drawn as one instanced mesh. The CPU uploads a tuft of blades and
 * one `aCell` per instance, once; everything else — where each blade stands, how tall and dry it
 * is, how it leans in the gust and away from the visitor — is computed in the vertex shader from
 * the camera position and `SharedUniforms`, so walking costs no buffer updates and reduced motion
 * freezes it with everything else.
 *
 * The grid wraps around the camera: a tuft that falls behind is the same instance re-hashed at a
 * cell ahead, and because every look-up keys on the world cell rather than the instance, each
 * blade lands with the look its cell always has.
 */
export class GrassField implements WorldObject {
  readonly id = 'grass';

  private mesh?: Mesh;
  private clearings: readonly Clearing[] = [];

  constructor(private readonly options: GrassOptions) {
    const counts = countKinds(options.bare);
    for (const kind of ['circle', 'ring', 'segment', 'arc'] as const) {
      if (counts[kind] > LIMITS[kind]) {
        throw new RangeError(
          `GrassField takes at most ${LIMITS[kind]} ${kind} exclusions, got ${counts[kind]}`,
        );
      }
    }
  }

  /** Extra bare circles known only once the scene has asked for anchors; call before `init`. */
  setClearings(spots: readonly Clearing[]): void {
    const circles = countKinds(this.options.bare).circle + spots.length;
    if (circles > LIMITS.circle) {
      throw new RangeError(
        `GrassField takes at most ${LIMITS.circle} circles including clearings, got ${circles}`,
      );
    }
    this.clearings = spots;
  }

  init(ctx: WorldContext): void {
    const detail = ctx.quality.shaderDetail;
    const side = tuftsPerSide(this.options.blades, ctx.quality);
    const radius = this.options.radius * TIER_RADIUS[detail];
    const tuft = (2 * radius) / side;

    const geometry = tuftGeometry(side);
    const material = grassMaterial(this.options, this.clearings, {
      side,
      tuft,
      radius,
      halfWidth: Math.min((tuft / TUFT_SIDE) * HALF_WIDTH_OF_CELL, MAX_HALF_WIDTH),
    });

    const mesh = new Mesh(geometry, material);
    mesh.name = this.id;
    // Positions are computed in the shader around the camera; the geometry's own bounds are the
    // single blade at the origin and would cull the whole field.
    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.receiveShadow = ctx.quality.shadows;
    this.mesh = mesh;
    ctx.scene.add(mesh);
  }

  update(): void {
    // The blades follow the camera and the clock inside the vertex shader.
  }

  dispose(): void {
    if (this.mesh) {
      disposeObject3D(this.mesh);
      this.mesh = undefined;
    }
  }
}

/** Tufts along one side of the grid for this tier: a full square, so the wrap has no gap. */
function tuftsPerSide(blades: number, quality: QualitySettings): number {
  const wanted = Math.max(1, blades * TIER_BLADES[quality.shaderDetail]);
  return Math.ceil(Math.sqrt(wanted / BLADES_PER_TUFT));
}

function countKinds(zones: readonly Exclusion[]): Record<Exclusion['kind'], number> {
  const counts = { circle: 0, ring: 0, segment: 0, arc: 0 };
  for (const zone of zones) {
    counts[zone.kind]++;
  }
  return counts;
}

/**
 * One tuft: `BLADES_PER_TUFT` blades of seven vertices and five triangles each, tapering to a
 * point, in a unit frame — x across the blade in units of the half-width, y up the blade from
 * 0 to 1. `aBlade` names the blade's sub-cell inside the tuft; `aCell`, per instance, names the
 * tuft's grid cell. The shader places, scales, turns and bends every blade from those two.
 */
function tuftGeometry(side: number): InstancedBufferGeometry {
  const geometry = new InstancedBufferGeometry();
  const rows: readonly (readonly [number, number])[] = [
    [1, 0],
    [0.8, 0.4],
    [0.45, 0.75],
  ];
  const positions = new Float32Array(BLADES_PER_TUFT * BLADE_VERTICES * 3);
  const blades = new Float32Array(BLADES_PER_TUFT * BLADE_VERTICES * 3);
  const index = new Uint16Array(BLADES_PER_TUFT * BLADE_INDICES);
  // Counter-clockwise seen from +z, which the shader turns towards the camera.
  const bladeIndex = [0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6];
  let seed = 0x9e3779b9;

  for (let blade = 0; blade < BLADES_PER_TUFT; blade++) {
    const first = blade * BLADE_VERTICES;
    let vertex = first;
    const put = (x: number, y: number) => {
      positions.set([x, y, 0], vertex * 3);
      vertex++;
    };
    for (const [halfWidth, t] of rows) {
      put(-halfWidth, t);
      put(halfWidth, t);
    }
    put(0, 1);

    // A small LCG is plenty: this value only breaks ties the world-cell hashes do not cover.
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const random = seed / 4294967296;
    for (let v = first; v < first + BLADE_VERTICES; v++) {
      blades.set([blade % TUFT_SIDE, Math.floor(blade / TUFT_SIDE), random], v * 3);
    }
    index.set(
      bladeIndex.map((i) => first + i),
      blade * BLADE_INDICES,
    );
  }
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('aBlade', new Float32BufferAttribute(blades, 3));
  geometry.setIndex(new BufferAttribute(index, 1));

  const cells = new Float32Array(side * side * 3);
  for (let i = 0; i < side; i++) {
    for (let j = 0; j < side; j++) {
      const at = (i * side + j) * 3;
      cells[at] = i;
      cells[at + 1] = j;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      cells[at + 2] = seed / 4294967296;
    }
  }
  geometry.setAttribute('aCell', new InstancedBufferAttribute(cells, 3));
  geometry.instanceCount = side * side;
  return geometry;
}

interface GridLayout {
  /** Tufts along one side of the grid. */
  readonly side: number;
  /** Edge of one tuft's cell, metres. */
  readonly tuft: number;
  readonly radius: number;
  readonly halfWidth: number;
}

/** The bare zones packed for the shader's fixed-size uniform arrays; unused slots stay zero. */
function bareUniforms(
  zones: readonly Exclusion[],
  clearings: readonly Clearing[],
): Record<string, { value: unknown }> {
  const circles = Array.from({ length: LIMITS.circle }, () => new Vector3());
  const rings = Array.from({ length: LIMITS.ring }, () => new Vector4());
  const segments = Array.from({ length: LIMITS.segment }, () => new Vector4());
  const segmentWidths = new Float32Array(LIMITS.segment);
  const arcs = Array.from({ length: LIMITS.arc }, () => new Vector4());
  const arcSpans = Array.from({ length: LIMITS.arc }, () => new Vector2());
  const counts = { circle: 0, ring: 0, segment: 0, arc: 0 };

  for (const zone of zones) {
    switch (zone.kind) {
      case 'circle':
        circles[counts.circle++].set(zone.x, zone.z, zone.radius);
        break;
      case 'ring':
        rings[counts.ring++].set(zone.x, zone.z, zone.inner, zone.outer);
        break;
      case 'segment':
        segmentWidths[counts.segment] = zone.halfWidth;
        segments[counts.segment++].set(zone.ax, zone.az, zone.bx, zone.bz);
        break;
      case 'arc':
        arcSpans[counts.arc].set(zone.from, zone.to);
        arcs[counts.arc++].set(zone.x, zone.z, zone.radius, zone.halfWidth);
        break;
    }
  }
  for (const spot of clearings) {
    circles[counts.circle++].set(spot.x, spot.z, spot.radius);
  }

  return {
    grassCircles: { value: circles },
    grassCircleCount: { value: counts.circle },
    grassRings: { value: rings },
    grassRingCount: { value: counts.ring },
    grassSegments: { value: segments },
    grassSegmentWidths: { value: segmentWidths },
    grassSegmentCount: { value: counts.segment },
    grassArcs: { value: arcs },
    grassArcSpans: { value: arcSpans },
    grassArcCount: { value: counts.arc },
  };
}

// Signed metres from `p` to the nearest bare zone's edge, negative inside. Arcs use the
// `arcAnchors` angle convention (0 along −Z, growing towards +X); the angular distance is taken
// along the arc's radius so the ends of a path fade over the same metres as its sides.
const CLEARANCE_GLSL = /* glsl */ `
uniform vec3 grassCircles[${LIMITS.circle}];
uniform int grassCircleCount;
uniform vec4 grassRings[${LIMITS.ring}];
uniform int grassRingCount;
uniform vec4 grassSegments[${LIMITS.segment}];
uniform float grassSegmentWidths[${LIMITS.segment}];
uniform int grassSegmentCount;
uniform vec4 grassArcs[${LIMITS.arc}];
uniform vec2 grassArcSpans[${LIMITS.arc}];
uniform int grassArcCount;

float grassClearance(vec2 p) {
  float clearance = 1e6;
  for (int i = 0; i < ${LIMITS.circle}; i++) {
    if (i >= grassCircleCount) break;
    clearance = min(clearance, distance(p, grassCircles[i].xy) - grassCircles[i].z);
  }
  for (int i = 0; i < ${LIMITS.ring}; i++) {
    if (i >= grassRingCount) break;
    float r = distance(p, grassRings[i].xy);
    clearance = min(clearance, max(grassRings[i].z - r, r - grassRings[i].w));
  }
  for (int i = 0; i < ${LIMITS.segment}; i++) {
    if (i >= grassSegmentCount) break;
    vec2 a = grassSegments[i].xy;
    vec2 ab = grassSegments[i].zw - a;
    float t = clamp(dot(p - a, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    clearance = min(clearance, distance(p, a + ab * t) - grassSegmentWidths[i]);
  }
  for (int i = 0; i < ${LIMITS.arc}; i++) {
    if (i >= grassArcCount) break;
    vec2 c = grassArcs[i].xy;
    float r = distance(p, c);
    float radial = abs(r - grassArcs[i].z) - grassArcs[i].w;
    float angle = atan(p.x - c.x, -(p.y - c.y));
    float angular = grassArcs[i].z * max(grassArcSpans[i].x - angle, angle - grassArcSpans[i].y);
    clearance = min(clearance, max(radial, angular));
  }
  return clearance;
}`;

function vertexDeclarations(heightGlsl: string): string {
  return /* glsl */ `
#include <common>
${WIND_GLSL}
${heightGlsl}
${CLEARANCE_GLSL}
attribute vec3 aCell;
attribute vec3 aBlade;
uniform vec3 grassWind;
uniform float grassTime;
uniform vec3 grassPlayer;
// x tufts per side, y tuft size in metres, z radius, w blade height at scale 1.
uniform vec4 grassField;
uniform float grassHalfWidth;
uniform vec3 grassRoot;
uniform vec3 grassTip;
uniform vec3 grassDry;
varying vec3 vGrassColour;
varying float vGrassT;`;
}

// Replaces `beginnormal_vertex`, the first chunk in `main`, so both the position and the normal
// come out of one pass over the blade; `begin_vertex` then only picks the position up.
const VERTEX_BLADE = /* glsl */ `
vec3 objectNormal;
vec3 grassPosition;
{
  float side = grassField.x;
  float tuftSize = grassField.y;
  float cellSize = tuftSize / ${TUFT_SIDE.toFixed(1)};

  // The world cell this tuft stands in right now: the grid slides with the camera, and a tuft
  // that falls off one edge comes back on the other. The blade's own cell sits inside it.
  vec2 origin = floor(cameraPosition.xz / tuftSize) - floor(side * 0.5);
  vec2 tuft = origin + mod(aCell.xy - origin, side);
  vec2 k = tuft * ${TUFT_SIDE.toFixed(1)} + aBlade.xy;

  // Everything about the blade hashes from the world cell, so it looks the same whichever
  // instance happens to draw it.
  float hJitterX = hash12(k + 0.37);
  float hJitterZ = hash12(k + 11.9);
  float hTurn = hash12(k + 23.1);
  float hSize = hash12(k + 47.3);
  float hShade = hash12(k + 5.5);
  vec2 base = (k + vec2(hJitterX, hJitterZ)) * cellSize;

  float cover = smoothstep(0.0, ${BORDER_METRES.toFixed(2)}, grassClearance(base));
  // Gone one whole tuft inside the radius: the outermost tuft is the one that wraps, and its
  // near edge comes as close as radius minus one tuft, so nothing visible ever jumps.
  float edge = grassField.z - tuftSize;
  float reach = 1.0 - smoothstep(edge * ${FADE_FROM.toFixed(2)}, edge, distance(base, cameraPosition.xz));
  float size = cover * reach * mix(0.7, 1.3, hSize);
  float height = grassField.w * size;
  float halfWidth = grassHalfWidth * size;

  float turn = hTurn * 6.2831853;
  vec2 facing = vec2(cos(turn), sin(turn));
  vec3 across = vec3(facing.x, 0.0, facing.y);
  vec3 bladeNormal = vec3(-facing.y, 0.0, facing.x);
  vec3 foot = vec3(base.x, terrainHeight(base), base.y);

  // Mirroring the blade flips its winding, so the side facing the camera is always the front:
  // back faces stay culled and the lit normal never has to be flipped in the fragment shader.
  float flip = dot(bladeNormal, cameraPosition - foot) < 0.0 ? -1.0 : 1.0;
  bladeNormal *= flip;

  float t = position.y;

  // Lean: the shared gust field, a little per-blade flutter, and a push away from the visitor.
  float gust = windGust(base, grassWind, grassTime);
  vec2 lean = windDirection(grassWind.z) * grassWind.x * (0.15 + 0.85 * gust) * 0.55;
  lean += vec2(sin(grassTime * 2.7 + hTurn * 40.0), cos(grassTime * 2.1 + hSize * 40.0)) * grassWind.x * 0.08;
  vec2 away = base - grassPlayer.xz;
  float awayLength = length(away);
  float push = 1.0 - smoothstep(0.25, 1.2, awayLength);
  lean += away / max(awayLength, 0.05) * push * 0.9;

  // The tip carries the lean (t², so the root stays planted) and drops a little as it goes over,
  // which keeps the blade roughly its own length.
  float bend = t * t;
  float droop = 1.0 - 0.3 * min(dot(lean, lean), 1.0) * bend;
  grassPosition = foot
    + across * (position.x * flip * halfWidth)
    + vec3(lean.x * bend * height, t * height * droop, lean.y * bend * height);
  // Blended towards up: a blade lit by its true normal flickers dark as it turns.
  objectNormal = normalize(mix(bladeNormal, vec3(0.0, 1.0, 0.0), 0.65));

  // Root-to-tip gradient, dried out in slow noise patches that take the tips first.
  float dry = smoothstep(0.55, 0.85, noise2(base * 0.12 + 7.0)) * (0.3 + 0.7 * t) * 0.8;
  vec3 colour = mix(mix(grassRoot, grassTip, t), grassDry, dry);
  vGrassColour = colour * mix(0.85, 1.1, hShade);
  vGrassT = t;
}`;

const VERTEX_POSITION = /* glsl */ `
vec3 transformed = grassPosition;`;

const FRAGMENT_DECLARATIONS = /* glsl */ `
#include <common>
uniform vec3 grassSunDirection;
uniform vec3 grassSunColor;
varying vec3 vGrassColour;
varying float vGrassT;`;

const FRAGMENT_COLOUR = /* glsl */ `
diffuseColor.rgb *= vGrassColour;`;

// Back-lit translucency: the tips glow warm when the visitor looks towards the sun, the look of
// a meadow in low light. Added as emissive so it sits on top of whatever the lights do.
const FRAGMENT_TRANSLUCENCY = /* glsl */ `
#include <emissivemap_fragment>
{
  vec3 sunView = normalize((viewMatrix * vec4(grassSunDirection, 0.0)).xyz);
  vec3 look = -normalize(vViewPosition);
  float toward = pow(max(dot(look, sunView), 0.0), 4.0);
  totalEmissiveRadiance += diffuseColor.rgb * grassSunColor * toward * vGrassT * vGrassT * 1.2;
}`;

/** djb2 over the height GLSL, so two worlds with different ground never share a grass program. */
function hashOf(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 33) ^ text.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

function grassMaterial(
  options: GrassOptions,
  clearings: readonly Clearing[],
  layout: GridLayout,
): MeshStandardMaterial {
  const { shared, colours } = options;
  const material = new MeshStandardMaterial({
    name: 'grass',
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
  });
  const bare = bareUniforms(options.bare, clearings);

  patchMaterial(material, `grass:${hashOf(options.heightGlsl)}`, (shader) => {
    Object.assign(shader.uniforms, bare, {
      grassWind: shared.wind,
      grassTime: shared.time,
      grassPlayer: shared.playerPosition,
      grassSunDirection: shared.sunDirection,
      grassSunColor: shared.sunColor,
      grassField: {
        value: new Vector4(layout.side, layout.tuft, layout.radius, options.height),
      },
      grassHalfWidth: { value: layout.halfWidth },
      grassRoot: { value: new Color(colours.root) },
      grassTip: { value: new Color(colours.tip) },
      grassDry: { value: new Color(colours.dry) },
    });

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', vertexDeclarations(options.heightGlsl))
      .replace('#include <beginnormal_vertex>', VERTEX_BLADE)
      .replace('#include <begin_vertex>', VERTEX_POSITION);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', FRAGMENT_DECLARATIONS)
      .replace('#include <color_fragment>', FRAGMENT_COLOUR)
      .replace('#include <emissivemap_fragment>', FRAGMENT_TRANSLUCENCY);
  });

  return withAtmosphere(material, shared);
}
