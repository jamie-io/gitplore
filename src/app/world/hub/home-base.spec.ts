import {
  BufferGeometry,
  CanvasTexture,
  Material,
  Mesh,
  MeshBasicMaterial,
  Texture,
  Vector3,
} from 'three';
import { stubContext } from '@engine/testing/world-context';
import { ABOUT } from '@content/about';
import { LICHTUNG } from '../environments/mood';
import { terrainHeightAt } from '../environments/terrain';
import { CAMP, CONTACT_PROMPT, HomeBase, HomeBaseOptions } from './home-base';

const ground = { heightAt: terrainHeightAt };

function homeBase(overrides: Partial<HomeBaseOptions> = {}): HomeBase {
  return new HomeBase({
    ground,
    mood: LICHTUNG,
    reducedMotion: () => false,
    onContact: () => undefined,
    ...overrides,
  });
}

function fakeCanvas() {
  const fillText = vi.fn();
  const canvasContext = {
    fillStyle: '',
    fillRect: vi.fn(),
    font: '',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    fillText,
    measureText: (text: string) => ({ width: text.length * 20 }),
  } as unknown as CanvasRenderingContext2D;
  const spy = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(canvasContext);
  return { fillText, restore: () => spy.mockRestore() };
}

describe('HomeBase', () => {
  it('places a fixed set of colliders before it is initialised', () => {
    const camp = homeBase();

    // Fire, pinboard, workbench, obelisk, controls board: known before `init`, never scaled.
    expect(camp.colliders).toHaveLength(5);
  });

  it('offers the contact prompt at the obelisk, out of reach of the spawn', () => {
    const onContact = vi.fn();
    const camp = homeBase({ onContact });
    const [obelisk] = camp.interactables;

    expect(camp.interactables).toHaveLength(1);
    expect(obelisk.prompt).toBe(CONTACT_PROMPT);
    expect(obelisk.position.x).toBeCloseTo(CAMP.obelisk.x);
    expect(obelisk.position.z).toBeCloseTo(CAMP.obelisk.z);
    // Arriving at the spawn must not already show a prompt.
    expect(Math.hypot(obelisk.position.x, obelisk.position.z)).toBeGreaterThan(obelisk.radius);

    obelisk.onInteract();
    expect(onContact).toHaveBeenCalledOnce();
  });

  it('offers nothing at the obelisk without a way to open the dialog', () => {
    expect(homeBase({ onContact: undefined }).interactables).toEqual([]);
  });

  it('stands on the terrain and moves with its origin', () => {
    const origin = new Vector3(3, 0, -2);
    const camp = homeBase({ origin });
    const [obelisk] = camp.interactables;

    expect(obelisk.position.x).toBeCloseTo(origin.x + CAMP.obelisk.x);
    expect(obelisk.position.z).toBeCloseTo(origin.z + CAMP.obelisk.z);
    expect(obelisk.position.y).toBeCloseTo(terrainHeightAt(obelisk.position.x, obelisk.position.z));
  });

  it('clears the grass under every collider it places', () => {
    const camp = homeBase();
    const inside = (x: number, z: number) =>
      camp.clearings.some((area) => Math.hypot(x - area.x, z - area.z) <= area.radius);

    for (const collider of camp.colliders) {
      const corners =
        collider.kind === 'cylinder'
          ? [
              [collider.x - collider.radius, collider.z],
              [collider.x + collider.radius, collider.z],
              [collider.x, collider.z - collider.radius],
              [collider.x, collider.z + collider.radius],
            ]
          : [
              [collider.minX, collider.minZ],
              [collider.minX, collider.maxZ],
              [collider.maxX, collider.minZ],
              [collider.maxX, collider.maxZ],
            ];
      corners.forEach(([x, z]) => expect(inside(x, z), `${x}, ${z}`).toBe(true));
    }
    // The spot kept for T10d's availability sign is cleared too.
    expect(inside(CAMP.reserved.x, CAMP.reserved.z)).toBe(true);
    // And nothing of this task stands on it.
    for (const collider of camp.colliders) {
      const distance =
        collider.kind === 'cylinder'
          ? Math.hypot(CAMP.reserved.x - collider.x, CAMP.reserved.z - collider.z) - collider.radius
          : Math.hypot(
              Math.max(collider.minX - CAMP.reserved.x, 0, CAMP.reserved.x - collider.maxX),
              Math.max(collider.minZ - CAMP.reserved.z, 0, CAMP.reserved.z - collider.maxZ),
            );
      expect(distance).toBeGreaterThan(0.6);
    }
  });

  it('writes Jamie’s name and role on the pinboard from about.ts', () => {
    const canvas = fakeCanvas();
    const camp = homeBase();
    const ctx = stubContext();

    camp.init(ctx);
    const written = canvas.fillText.mock.calls.map(([text]) => text as string);

    expect(written).toContain(ABOUT.profile.name);
    // The role may wrap; every word of it is on the board.
    for (const word of ABOUT.profile.role.split(' ')) {
      expect(
        written.some((line) => line.split(' ').includes(word)),
        word,
      ).toBe(true);
    }
    expect(written).toContain('Kontakt');
    expect(written).toContain('Steuerung');
    camp.dispose();
    canvas.restore();
  });

  it('adds itself and its embers to the scene and takes everything back on dispose', () => {
    const canvas = fakeCanvas();
    const camp = homeBase();
    const ctx = stubContext();
    camp.init(ctx);

    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    const textures = new Set<Texture>();
    ctx.scene.traverse((object) => {
      const mesh = object as Mesh;
      if (mesh.geometry) {
        geometries.add(mesh.geometry);
      }
      const material = mesh.material as Material | undefined;
      if (material) {
        materials.add(material);
        const map = (material as MeshBasicMaterial).map;
        if (map) {
          textures.add(map);
        }
      }
    });
    expect(ctx.scene.children.length).toBeGreaterThanOrEqual(2);
    expect(textures.size).toBeGreaterThanOrEqual(3);
    textures.forEach((texture) => expect(texture).toBeInstanceOf(CanvasTexture));

    const disposed = new Set<unknown>();
    [...geometries, ...materials, ...textures].forEach((resource) =>
      resource.addEventListener('dispose', () => disposed.add(resource)),
    );
    camp.dispose();

    expect(ctx.scene.children).toHaveLength(0);
    expect(disposed.size).toBe(geometries.size + materials.size + textures.size);
    canvas.restore();
  });

  it('holds its flames and embers still under reduced motion', () => {
    let reduced = true;
    const camp = homeBase({ reducedMotion: () => reduced });
    const ctx = stubContext();
    camp.init(ctx);
    const clock = (camp as unknown as { shared: { time: { value: number } } }).shared.time;

    camp.update(0.5, ctx);
    expect(clock.value).toBe(0);

    reduced = false;
    camp.update(0.5, ctx);
    expect(clock.value).toBe(0.5);
    camp.dispose();
  });
});
