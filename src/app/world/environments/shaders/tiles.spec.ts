import {
  Color,
  MeshStandardMaterial,
  ShaderLib,
  WebGLProgramParametersWithUniforms,
  WebGLRenderer,
} from 'three';
import { LICHTUNG } from '../mood';
import { withAtmosphere } from './atmosphere';
import { SharedUniforms } from './shared-uniforms';
import { TileOptions, withTiles } from './tiles';

function compile(material: MeshStandardMaterial): WebGLProgramParametersWithUniforms {
  const shader = {
    vertexShader: ShaderLib.standard.vertexShader,
    fragmentShader: ShaderLib.standard.fragmentShader,
    uniforms: {},
    defines: {},
  } as unknown as WebGLProgramParametersWithUniforms;
  material.onBeforeCompile(shader, {} as WebGLRenderer);
  return shader;
}

function options(overrides: Partial<TileOptions> = {}): TileOptions {
  return {
    size: 1.1,
    grout: 0.035,
    groutColour: 0x9a9080,
    colours: [0xd9cdb5, 0xcfc1a6, 0xe2d7c1, 0xc9b99c],
    pattern: 'grid',
    ...overrides,
  };
}

describe('withTiles', () => {
  it('paints the tiles into the fragment shader from the world position', () => {
    const shader = compile(withTiles(new MeshStandardMaterial(), options()));

    expect(shader.fragmentShader).toContain('TileSample sampleTiles(');
    expect(shader.fragmentShader).toContain('diffuseColor.rgb = tile.colour;');
    expect(shader.fragmentShader).toContain('varying vec3 vTileWorld;');
    expect(shader.vertexShader).toContain('vTileWorld = ');
    // The grout is antialiased in screen space from the continuous world position, never from
    // the sawtooth cell coordinate.
    expect(shader.fragmentShader).toContain('fwidth(');
  });

  it('keeps the grout and the roughness spread in the light path', () => {
    const shader = compile(
      withTiles(new MeshStandardMaterial(), options({ roughness: { min: 0.55, max: 0.9 } })),
    );

    expect(shader.fragmentShader).toContain('roughnessFactor = tile.roughness;');
    expect(shader.fragmentShader).toContain('#include <roughnessmap_fragment>');
    expect(shader.fragmentShader).toContain(
      'normal = normalize(normal + mat3(viewMatrix) * tile.tilt);',
    );
  });

  it('carries the colours as linear uniforms, four slots whatever the list length', () => {
    const shader = compile(
      withTiles(new MeshStandardMaterial(), options({ colours: [0xd9cdb5, 0x3f6f8f] })),
    );

    const colours = shader.uniforms['tileColours'].value as Color[];
    expect(colours).toHaveLength(4);
    expect(colours[0]).toEqual(new Color(0xd9cdb5));
    expect(colours[1]).toEqual(new Color(0x3f6f8f));
    expect(shader.uniforms['tileGroutColour'].value).toEqual(new Color(0x9a9080));
    expect(shader.fragmentShader).toContain('#define TILE_COLOURS 2');
  });

  it('refuses a fifth colour, in the base list and in the ring', () => {
    const five = [0x111111, 0x222222, 0x333333, 0x444444, 0x555555];

    expect(() => withTiles(new MeshStandardMaterial(), options({ colours: five }))).toThrow(
      RangeError,
    );
    expect(() =>
      withTiles(
        new MeshStandardMaterial(),
        options({ ring: { x: 0, z: 0, inner: 5, outer: 9, colours: five } }),
      ),
    ).toThrow(RangeError);
    expect(() => withTiles(new MeshStandardMaterial(), options({ colours: [] }))).toThrow(
      RangeError,
    );
  });

  it('compiles each pattern to a program of its own', () => {
    const keys = (['grid', 'cobble', 'slab'] as const).map((pattern) =>
      withTiles(new MeshStandardMaterial(), options({ pattern })).customProgramCacheKey(),
    );

    expect(new Set(keys).size).toBe(3);
    expect(keys[0]).not.toBe(new MeshStandardMaterial().customProgramCacheKey());
  });

  it('adds the mosaic ring only when asked, and passes its band as a uniform', () => {
    const plain = compile(withTiles(new MeshStandardMaterial(), options()));
    const ringed = compile(
      withTiles(
        new MeshStandardMaterial(),
        options({ ring: { x: 1, z: -2, inner: 5.2, outer: 9.8, colours: [0x3f6f8f, 0xb8583a] } }),
      ),
    );

    expect(plain.fragmentShader).not.toContain('#define TILE_RING');
    expect(ringed.fragmentShader).toContain('#define TILE_RING');
    // The band lays a picture, not a random scatter of tesserae.
    expect(ringed.fragmentShader).toContain('float mosaicMotif(');
    expect(ringed.fragmentShader).toContain('#define TILE_RING_COLOURS 2');
    expect(ringed.uniforms['tileRing'].value.toArray()).toEqual([1, -2, 5.2, 9.8]);
    expect(ringed.uniforms['tileRingColours'].value).toHaveLength(4);
    // An even count of lozenges, so the rims that alternate around the ring meet up.
    const [lozenges, inverseWidth] = ringed.uniforms['tileRingMotif'].value.toArray();
    expect(lozenges % 2).toBe(0);
    expect(lozenges).toBeGreaterThanOrEqual(4);
    expect(inverseWidth).toBeCloseTo(1 / 4.6);
    expect(withTiles(new MeshStandardMaterial(), options()).customProgramCacheKey()).not.toBe(
      withTiles(
        new MeshStandardMaterial(),
        options({ ring: { x: 0, z: 0, inner: 5, outer: 9, colours: [0x3f6f8f] } }),
      ).customProgramCacheKey(),
    );
  });

  it('drops the wear, bevel, tilt and mosaic ring on the cheapest tier', () => {
    const ring = { x: 0, z: 0, inner: 5, outer: 9, colours: [0x3f6f8f] };
    const cheap = compile(withTiles(new MeshStandardMaterial(), options({ detail: 0, ring })));
    const full = compile(withTiles(new MeshStandardMaterial(), options({ detail: 2 })));

    expect(cheap.fragmentShader).toContain('#define TILE_DETAIL 0');
    expect(cheap.fragmentShader).not.toContain('#define TILE_RING');
    expect(full.fragmentShader).toContain('#define TILE_DETAIL 2');
    expect(compile(withTiles(new MeshStandardMaterial(), options())).fragmentShader).toContain(
      '#define TILE_DETAIL 2',
    );
  });

  it('composes with the atmosphere in either order', () => {
    const shared = new SharedUniforms(LICHTUNG);
    const tilesFirst = withAtmosphere(withTiles(new MeshStandardMaterial(), options()), shared);
    const atmosphereFirst = withTiles(
      withAtmosphere(new MeshStandardMaterial(), shared),
      options(),
    );

    for (const material of [tilesFirst, atmosphereFirst]) {
      const shader = compile(material);
      expect(shader.vertexShader).toContain('vTileWorld = ');
      expect(shader.vertexShader).toContain('vAtmosWorld = ');
      expect(shader.vertexShader.match(/#include <common>/g)).toHaveLength(1);
      expect(shader.vertexShader.match(/#include <project_vertex>/g)).toHaveLength(1);
      expect(shader.fragmentShader.match(/#define GITPLORE_NOISE/g)).toHaveLength(1);
      expect(shader.fragmentShader).toContain('atmosphereFog(');
      expect(shader.uniforms['tileColours']).toBeDefined();
      expect(shader.uniforms['atmosHeightFog']).toBe(shared.heightFog);
    }
  });

  it('returns the material it patched', () => {
    const material = new MeshStandardMaterial();

    expect(withTiles(material, options())).toBe(material);
  });
});
