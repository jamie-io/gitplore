import { Color, MeshStandardMaterial, Vector2, Vector4 } from 'three';
import { NOISE_GLSL } from './noise.glsl';
import { patchMaterial } from './patch';

export interface TileOptions {
  /** Tile edge in metres (grid and slab); mean cell size (cobble). */
  readonly size: number;
  /** Grout width in metres. */
  readonly grout: number;
  readonly groutColour: number;
  /** 1–4 tile colours, picked per tile by hash. */
  readonly colours: readonly number[];
  /** 'grid' square tiles, 'cobble' irregular Voronoi setts, 'slab' 2:1 slabs in a stretcher bond. */
  readonly pattern: 'grid' | 'cobble' | 'slab';
  /** A mosaic band around a point, 1–4 colours, small tessellated tiles. */
  readonly ring?: {
    readonly x: number;
    readonly z: number;
    readonly inner: number;
    readonly outer: number;
    readonly colours: readonly number[];
  };
  /** Per-tile roughness spread; the material's own roughness when absent. */
  readonly roughness?: { readonly min: number; readonly max: number };
  /**
   * `QualitySettings.shaderDetail`; full detail when absent, so pass it. The cheapest tier keeps
   * the pattern, the per-tile colours and roughness and the antialiased grout, and drops the wear,
   * the bevel, the normal tilt and the mosaic ring, which is what the software renderer in the
   * browser suite feels.
   */
  readonly detail?: 0 | 1 | 2;
}

/** The most colours a list may carry: the shader holds a fixed four slots per palette. */
const MAX_COLOURS = 4;
/** Edge of one mosaic tile in the ring, and the grout between them, in metres. */
const MOSAIC_SIZE = 0.12;
const MOSAIC_GROUT = 0.012;

/** Share of the ring band's width the lozenge field fills; the rest is border. */
const LOZENGE_DEPTH = 0.78;

const PATTERN_INDEX = { grid: 0, cobble: 1, slab: 2 } as const;

const VERTEX_DECLARATIONS = /* glsl */ `
varying vec3 vTileWorld;
#include <common>`;

// After `project_vertex`, like the atmosphere: `transformed` is final and any batching or instance
// matrix is in scope, so a scattered slab and a single floor sample the same world grid.
const VERTEX_WORLD_POSITION = /* glsl */ `
#include <project_vertex>
{
  vec4 tilePosition = vec4(transformed, 1.0);
  #ifdef USE_BATCHING
    tilePosition = batchingMatrix * tilePosition;
  #endif
  #ifdef USE_INSTANCING
    tilePosition = instanceMatrix * tilePosition;
  #endif
  vTileWorld = (modelMatrix * tilePosition).xyz;
}`;

/**
 * The pattern functions each answer the same question for the point under the fragment: which
 * cell is it in (an id the hashes key on), and how far is the nearest grout centre line. The
 * grout, the colour pick and the bevel are then the same code for all three.
 */
const FRAGMENT_DECLARATIONS = /* glsl */ `
#include <common>
${NOISE_GLSL}
varying vec3 vTileWorld;
// x tile size, y grout width, z and w the roughness spread.
uniform vec4 tileParams;
uniform vec3 tileColours[4];
// The palette's average, which the tiles settle on once one fragment spans several of them.
uniform vec3 tileMean;
uniform vec3 tileGroutColour;
#ifdef TILE_RING
  // x, y the centre (world x, z); z inner and w outer radius of the band.
  uniform vec4 tileRing;
  uniform vec3 tileRingColours[4];
  uniform vec3 tileRingMean;
  // x lozenges around the ring, y one over the band's width.
  uniform vec2 tileRingMotif;
#endif

struct TileSample {
  vec3 colour;
  float roughness;
  vec3 tilt;
};

struct TileCell {
  vec2 id;
  // Metres to the nearest grout centre line: continuous across the line, so it antialiases.
  float edge;
  // World x/z direction from the stone towards that line: the way a bevelled edge leans.
  vec2 toEdge;
};

// Keeps whichever edge is nearer: how a pattern's own grout and a border drawn over it combine.
void tileCloser(inout TileCell cell, float edge, vec2 toEdge) {
  cell.toEdge = edge < cell.edge ? toEdge : cell.toEdge;
  cell.edge = min(cell.edge, edge);
}

TileCell tileGrid(vec2 p, float size) {
  vec2 cell = floor(p / size);
  vec2 f = p - (cell + 0.5) * size;
  bool across = abs(f.x) > abs(f.y);
  return TileCell(
    cell,
    size * 0.5 - max(abs(f.x), abs(f.y)),
    across ? vec2(sign(f.x), 0.0) : vec2(0.0, sign(f.y))
  );
}

// 2:1 slabs, every other row shifted by half a slab.
TileCell tileSlab(vec2 p, float size) {
  float row = floor(p.y / size);
  float shifted = p.x + mod(row, 2.0) * size;
  float col = floor(shifted / (2.0 * size));
  float fx = shifted - (col + 0.5) * 2.0 * size;
  float fz = p.y - (row + 0.5) * size;
  float ends = size - abs(fx);
  float sides = size * 0.5 - abs(fz);
  return TileCell(
    vec2(col, row),
    min(ends, sides),
    ends < sides ? vec2(sign(fx), 0.0) : vec2(0.0, sign(fz))
  );
}

// Jittered-grid Voronoi. Half the gap between the nearest and the second-nearest site is the
// distance to their border along the line that joins them, and near enough to it elsewhere that
// the grout only breathes a little in width, which setts do anyway.
TileCell tileCobble(vec2 p, float size) {
  vec2 q = p / size;
  vec2 cell = floor(q);
  vec2 f = q - cell;
  float first = 8.0;
  float second = 8.0;
  vec2 firstSite = vec2(0.0);
  vec2 secondSite = vec2(1.0);
  vec2 id = cell;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 n = vec2(float(i), float(j));
      float h = hash12(cell + n);
      vec2 site = n + 0.2 + 0.6 * vec2(h, fract(h * 41.7));
      float d = length(site - f);
      if (d < first) {
        second = first;
        secondSite = firstSite;
        first = d;
        firstSite = site;
        id = cell + n;
      } else if (d < second) {
        second = d;
        secondSite = site;
      }
    }
  }
  return TileCell(id, 0.5 * (second - first) * size, normalize(secondSite - firstSite));
}

#ifdef TILE_RING
  // atan2 as a fraction of a turn in [0, 1), from a polynomial good to about 1e-5 rad.
  float tileTurn(vec2 d) {
    vec2 a = abs(d);
    float t = min(a.x, a.y) / max(max(a.x, a.y), 1e-6);
    float s = t * t;
    float angle = ((-0.0464964749 * s + 0.15931422) * s - 0.327622764) * s * t + t;
    angle = a.y > a.x ? 1.57079633 - angle : angle;
    angle = d.x < 0.0 ? 3.14159265 - angle : angle;
    return (d.y < 0.0 ? -angle : angle) / PI2 + 0.5;
  }

  // Rows of small tiles around the centre, each row cut into as many sectors as keep the tiles
  // roughly square, so the tesserae follow the ring; the band's two edges are grout lines too.
  // at receives the picture's sample point as radius and turn: the tile's centre up close, the
  // fragment itself once the tiles blur (coarse).
  TileCell tileMosaic(vec2 p, vec2 d, float r, bool coarse, out vec2 at) {
    const float m = ${MOSAIC_SIZE.toFixed(3)};
    vec2 outward = d / max(r, 1e-4);
    float rr = r - tileRing.z;
    float row = floor(rr / m);
    float rowRadius = tileRing.z + (row + 0.5) * m;
    float sectors = max(floor(PI2 * rowRadius / m + 0.5), 6.0);
    float here = tileTurn(d);
    float turn = here * sectors;
    float sector = mod(floor(turn), sectors);
    float arc = PI2 * rowRadius / sectors;
    float fa = (fract(turn) - 0.5) * arc;
    float fr = rr - (row + 0.5) * m;
    TileCell cell = TileCell(vec2(sector, row), m * 0.5 - abs(fr), outward * sign(fr));
    tileCloser(cell, arc * 0.5 - abs(fa), vec2(-outward.y, outward.x) * sign(fa));
    tileCloser(cell, rr, -outward);
    tileCloser(cell, tileRing.w - r, outward);
    at = coarse ? vec2(r, here) : vec2(rowRadius, (sector + 0.5) / sectors);
    return cell;
  }

  // The picture the mosaic lays: a border in colour 0 edged with colour 2, and on a field of
  // colour 1 a chain of lozenges, their rims alternating 2 and 0 around the ring, 3 inside and
  // a heart of the other rim colour. Indices past a shorter palette wrap, so two or three
  // colours still draw a pattern. tileRingMotif carries the lozenge count and the band's
  // inverse width.
  float mosaicMotif(float radius, float turn) {
    float v = (radius - tileRing.z) * tileRingMotif.y;
    float edge = abs(v - 0.5);
    float u = turn * tileRingMotif.x;
    float lozenge = abs(fract(u) - 0.5) * 2.0 + edge * ${(1 / 0.39).toFixed(4)};
    float odd = step(0.5, fract(u * 0.5));
    float index = edge > 0.42 ? 0.0
      : edge > 0.39 ? 2.0
      : lozenge >= 0.92 ? 1.0
      : lozenge >= 0.66 ? 2.0 - 2.0 * odd
      : lozenge >= 0.52 ? 1.0
      : lozenge >= 0.2 ? 3.0
      : 2.0 * odd;
    return mod(index, float(TILE_RING_COLOURS));
  }
#endif

// A macro rather than a function, so the palette is read in place instead of copied per call.
#define TILE_PICK(palette, index) ((index) < 0.5 ? palette[0] : (index) < 1.5 ? palette[1] : (index) < 2.5 ? palette[2] : palette[3])

TileSample sampleTiles(vec2 p, float baseRoughness) {
  float size = tileParams.x;
  float grout = tileParams.y;
  #if TILE_PATTERN == 0
    TileCell cell = tileGrid(p, size);
  #elif TILE_PATTERN == 1
    TileCell cell = tileCobble(p, size);
  #else
    TileCell cell = tileSlab(p, size);
  #endif

  // The fragment's footprint in metres, taken from the continuous world position rather than the
  // sawtooth cell coordinate. A derivative that degenerates (the bug behind the terrain's baked
  // normals, on the triangle that straddles the camera) fails the range check, NaN included, and
  // falls back to the footprint of a fragment a few metres away, so no fragment can go black.
  float footprint = length(fwidth(p)) * 0.6;
  float aa = (footprint >= 1e-4 && footprint <= size * 4.0) ? footprint : 0.006;

  // One hash per stone feeds its colour pick, shade, roughness and lean: the software renderer
  // behind the low tier pays for every instruction on every floor fragment.
  float h = hash12(cell.id + 0.37);
  // Once a fragment covers a good part of a tile, settle on the average coverage instead of
  // moiré between grout lines, and on the palette's mean instead of a shimmer of picks.
  float far = smoothstep(size * 0.1, size * 0.4, aa);
  vec3 colour = TILE_PICK(tileColours, floor(h * float(TILE_COLOURS)));
  vec3 mean = tileMean;
  #ifdef TILE_RING
    vec2 fromCentre = p - tileRing.xy;
    float ringDistance = length(fromCentre);
    if (ringDistance > tileRing.z && ringDistance < tileRing.w) {
      size = ${MOSAIC_SIZE.toFixed(3)};
      grout = min(grout, ${MOSAIC_GROUT.toFixed(3)});
      far = smoothstep(size * 0.1, size * 0.4, aa);
      // Tessellated up close, sampled at each tile's centre; past the point where single tiles
      // resolve the picture itself still does, sampled under the fragment, and only once even
      // the lozenges shrink below a fragment does it blur to the palette's average.
      vec2 at;
      cell = tileMosaic(p, fromCentre, ringDistance, far >= 0.5, at);
      h = hash12(cell.id + 0.37);
      colour = TILE_PICK(tileRingColours, mosaicMotif(at.x, at.y));
      mean = mix(colour, tileRingMean, smoothstep(0.12, 0.45, aa));
    } else {
      // The band's border is grout on the pattern's side as well.
      vec2 outward = fromCentre / max(ringDistance, 1e-4);
      bool beyond = ringDistance >= tileRing.w;
      tileCloser(cell, beyond ? ringDistance - tileRing.w : tileRing.z - ringDistance, beyond ? -outward : outward);
    }
  #endif

  // Antialias the grout over the footprint.
  float mask = smoothstep(grout * 0.5 - aa, grout * 0.5 + aa, cell.edge);
  mask = mix(mask, 1.0 - 2.0 * grout / size, far);
  colour = mix(colour, mean, far);

  // Every stone is a little lighter or darker than its neighbours.
  vec3 stone = colour * mix(0.9 + 0.2 * fract(h * 17.0), 1.0, far);
  vec3 tilt = vec3(0.0);
  #if TILE_DETAIL >= 1
    // Wear: broad patches of dust and damper stone over tile and grout alike.
    float wear = noise2(p * 0.45 + vec2(7.0, 3.0)) * 0.7 + noise2(p * 2.3) * 0.3;
    // The bevel leans the normal towards the grout, so its sunward edge catches the light and
    // the far one falls into shade; it fades before it narrows below a fragment and shimmers.
    float bevelWidth = max(size * 0.03, 0.008);
    float bevel = (1.0 - smoothstep(grout * 0.5, grout * 0.5 + bevelWidth, cell.edge))
      * (1.0 - smoothstep(bevelWidth * 0.5, bevelWidth * 1.5, aa)) * mask;
    stone *= (0.86 + 0.28 * wear) * (1.0 - 0.12 * bevel);
    // And each stone sits a little out of level, so the sun picks some out.
    vec2 lean = vec2(fract(h * 71.0), fract(h * 113.0)) - 0.5;
    tilt = vec3(lean.x, 0.0, lean.y) * 0.1 * mask + vec3(cell.toEdge.x, 0.0, cell.toEdge.y) * 0.6 * bevel;
  #endif

  #ifdef TILE_ROUGHNESS
    float tileRoughness = mix(tileParams.z, tileParams.w, fract(h * 43.0));
  #else
    float tileRoughness = baseRoughness;
  #endif

  TileSample tileSample;
  tileSample.colour = mix(tileGroutColour * 0.85, stone, mask);
  tileSample.roughness = mix(min(tileRoughness + 0.25, 1.0), tileRoughness, mask);
  tileSample.tilt = tilt;
  return tileSample;
}`;

const FRAGMENT_COLOUR = /* glsl */ `
#include <color_fragment>
TileSample tile = sampleTiles(vTileWorld.xz, roughness);
diffuseColor.rgb = tile.colour;`;

const FRAGMENT_ROUGHNESS = /* glsl */ `
#include <roughnessmap_fragment>
roughnessFactor = tile.roughness;`;

// `normal` is in view space here; the tilt is a world-space lean, so it goes through the view
// rotation before the two are combined.
const FRAGMENT_NORMAL = /* glsl */ `
#include <normal_fragment_maps>
#if TILE_DETAIL >= 1
  normal = normalize(normal + mat3(viewMatrix) * tile.tilt);
#endif`;

/**
 * Turns `material` into a paved floor computed from the world x/z, so any flat ground can wear it
 * without uvs: square tiles, Voronoi setts or slabs in a stretcher bond, each stone its own colour,
 * shade and roughness from a hash of its id, with darker, rougher grout between them and, on the
 * fuller tiers, wear, a bevel and a slight lean so the sun catches individual stones. An optional
 * mosaic band replaces the pattern in a ring around a point. The material's own colour is not
 * consulted: the palettes are the colour.
 *
 * Pattern, palette sizes, ring and detail are compile-time (they change the program); the sizes and
 * colours are uniforms, so two floors that differ only in colour share one program.
 */
export function withTiles<T extends MeshStandardMaterial>(material: T, options: TileOptions): T {
  const colours = palette(options.colours, 'colours');
  const ringColours = options.ring ? palette(options.ring.colours, 'ring.colours') : undefined;
  const detail = options.detail ?? 2;
  // The cheapest tier paves straight through the ring. The software renderer behind it runs both
  // sides of every branch, so the mosaic would cost every floor fragment, not just the band's:
  // about a tenth of the Plaza's frame, measured.
  const ring = detail > 0 ? options.ring : undefined;
  const { roughness } = options;
  const key = [
    'tiles',
    options.pattern,
    options.colours.length,
    ring ? ring.colours.length : 0,
    detail,
    roughness ? 'r' : '-',
  ].join(':');

  return patchMaterial(material, key, (shader) => {
    shader.uniforms['tileParams'] = {
      value: new Vector4(options.size, options.grout, roughness?.min ?? 0, roughness?.max ?? 0),
    };
    shader.uniforms['tileColours'] = { value: colours };
    shader.uniforms['tileMean'] = { value: mean(options.colours) };
    shader.uniforms['tileGroutColour'] = { value: new Color(options.groutColour) };
    if (ring && ringColours) {
      shader.uniforms['tileRing'] = { value: new Vector4(ring.x, ring.z, ring.inner, ring.outer) };
      shader.uniforms['tileRingColours'] = { value: ringColours };
      shader.uniforms['tileRingMean'] = { value: mean(ring.colours) };
      shader.uniforms['tileRingMotif'] = { value: motif(ring) };
    }

    const defines = [
      `#define TILE_PATTERN ${PATTERN_INDEX[options.pattern]}`,
      `#define TILE_COLOURS ${options.colours.length}`,
      `#define TILE_DETAIL ${detail}`,
      ...(ring ? ['#define TILE_RING', `#define TILE_RING_COLOURS ${ring.colours.length}`] : []),
      ...(roughness ? ['#define TILE_ROUGHNESS'] : []),
    ].join('\n');

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', VERTEX_DECLARATIONS)
      .replace('#include <project_vertex>', VERTEX_WORLD_POSITION);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `${defines}\n${FRAGMENT_DECLARATIONS}`)
      .replace('#include <color_fragment>', FRAGMENT_COLOUR)
      .replace('#include <roughnessmap_fragment>', FRAGMENT_ROUGHNESS)
      .replace('#include <normal_fragment_maps>', FRAGMENT_NORMAL);
  });
}

/** Linear colours in the shader's four fixed slots; the unused ones repeat the last. */
function palette(hexes: readonly number[], name: string): Color[] {
  if (hexes.length < 1 || hexes.length > MAX_COLOURS) {
    throw new RangeError(
      `withTiles: ${name} takes 1 to ${MAX_COLOURS} colours, got ${hexes.length}`,
    );
  }
  return Array.from(
    { length: MAX_COLOURS },
    (_, i) => new Color(hexes[Math.min(i, hexes.length - 1)]),
  );
}

/**
 * How many lozenges fit around the ring, an even count so the alternating rims close up, each
 * about as wide as the field is deep; and the band's inverse width, which the shader multiplies by.
 */
function motif(ring: NonNullable<TileOptions['ring']>): Vector2 {
  const band = ring.outer - ring.inner;
  const around = (Math.PI * (ring.inner + ring.outer)) / (band * LOZENGE_DEPTH);
  return new Vector2(Math.max(2 * Math.round(around / 2), 4), 1 / band);
}

/** The linear average of a palette: what a stretch of its tiles looks like from far away. */
function mean(hexes: readonly number[]): Color {
  const sum = new Color(0, 0, 0);
  for (const hex of hexes) {
    sum.add(new Color(hex));
  }
  return sum.multiplyScalar(1 / hexes.length);
}
