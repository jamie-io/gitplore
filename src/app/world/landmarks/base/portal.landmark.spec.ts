import {
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
} from 'three';
import { qualitySettings } from '@engine/capability.service';
import { StubAssets } from '@engine/testing/world-context';
import { PlayerController } from '@engine/player/player-controller';
import { WorldContext } from '@engine/world-object';
import { PROJECT_FIXTURES as PROJECTS } from '@content/testing/project-fixtures';
import { Project } from '@content/project.model';
import { LandmarkOptions, SPAWN_DISTANCE } from './landmark';
import {
  DOLLY_SECONDS,
  MODEL_LOAD_RADIUS,
  PortalLandmark,
  VEIL_FADE,
  VEIL_HIDE,
  VEIL_OPACITY,
} from './portal.landmark';

const FLAT = { heightAt: () => 0 };

function project(overrides: Partial<Project['landmark']> = {}): Project {
  const base = PROJECTS.find((p) => p.slug === 'deslopify')!;
  return { ...base, landmark: { ...base.landmark, ...overrides } };
}

function options(overrides: Partial<LandmarkOptions> = {}): LandmarkOptions {
  const target = overrides.project ?? project();
  return {
    project: target,
    placement: {
      position: target.landmark.position ?? [0, 0, 0],
      rotationY: target.landmark.rotationY ?? 0,
    },
    ground: FLAT,
    reducedMotion: () => false,
    onEnter: () => undefined,
    ...overrides,
  };
}

function context(): WorldContext {
  return {
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    player: new PlayerController(),
    quality: qualitySettings('medium'),
    assets: new StubAssets(),
  };
}

describe('PortalLandmark', () => {
  it('stands where the project says, on the ground', () => {
    const portal = new PortalLandmark(
      options({ project: project({ position: [4, 0, -20] }), ground: { heightAt: () => 1.5 } }),
    );

    expect(portal.group.position.toArray()).toEqual([4, 1.5, -20]);
  });

  it('spawns the returning player a few metres in front, facing away', () => {
    const portal = new PortalLandmark(
      options({ project: project({ position: [0, 0, -20], rotationY: 0 }) }),
    );

    // Front is +Z at rotation 0: towards the hub centre.
    expect(portal.spawn.x).toBeCloseTo(0, 6);
    expect(portal.spawn.z).toBeCloseTo(-20 + SPAWN_DISTANCE, 6);
    // Player forward is -Z at yaw 0, so facing away from the portal means yaw π.
    expect(Math.cos(portal.spawnYaw)).toBeCloseTo(-1, 6);
  });

  it('rotates the spawn with the landmark', () => {
    const portal = new PortalLandmark(
      options({ project: project({ position: [10, 0, -20], rotationY: Math.PI / 2 }) }),
    );

    expect(portal.spawn.x).toBeCloseTo(10 + SPAWN_DISTANCE, 6);
    expect(portal.spawn.z).toBeCloseTo(-20, 6);
  });

  it('blocks the player with its two pillars', () => {
    const portal = new PortalLandmark(options());

    expect(portal.colliders.length).toBe(2);
    expect(portal.colliders.every((c) => c.kind === 'cylinder')).toBe(true);
  });

  it('offers one interactable that names the project', () => {
    const portal = new PortalLandmark(options());

    expect(portal.interactables.length).toBe(1);
    expect(portal.interactables[0].prompt).toContain('Deslopify');
    expect(portal.interactables[0].radius).toBeGreaterThan(SPAWN_DISTANCE);
  });

  it('adds its meshes to the scene on init and removes them on dispose', () => {
    const ctx = context();
    const portal = new PortalLandmark(options());

    portal.init(ctx);
    expect(ctx.scene.children).toContain(portal.group);
    expect(portal.group.getObjectByName('proxy')?.children.length).toBeGreaterThan(2);

    portal.dispose();
    expect(ctx.scene.children).not.toContain(portal.group);
  });

  it('enters at once under reduced motion', () => {
    const entered: string[] = [];
    const portal = new PortalLandmark(
      options({ reducedMotion: () => true, onEnter: (p) => entered.push(p.slug) }),
    );
    portal.init(context());

    portal.interactables[0].onInteract();

    expect(entered).toEqual(['deslopify']);
  });

  it('dollies the player towards the portal before entering', () => {
    const entered: string[] = [];
    const ctx = context();
    const portal = new PortalLandmark(
      options({
        project: project({ position: [0, 0, -20] }),
        onEnter: (p) => entered.push(p.slug),
      }),
    );
    portal.init(ctx);
    ctx.player.teleport(portal.spawn.clone().setY(1.7), 0);
    const startZ = ctx.player.position.z;

    portal.interactables[0].onInteract();
    portal.update(DOLLY_SECONDS / 2, ctx);

    expect(entered).toEqual([]);
    expect(ctx.player.position.z).toBeLessThan(startZ);

    portal.update(DOLLY_SECONDS / 2, ctx);
    expect(entered).toEqual(['deslopify']);
  });

  /**
   * A third-person camera stands 3.6 m behind a player who arrives `SPAWN_DISTANCE` from the
   * portal, so it ends up on the far side of the glowing surface looking back through it. At that
   * range the surface covers the whole frame: it has to stop being drawn.
   */
  describe('the glowing surface against a camera that comes through it', () => {
    /** The surface hangs level with the middle of the arch, which is where the fade measures from. */
    const veilOf = (portal: PortalLandmark) =>
      portal.group.children.find(
        (child) => child instanceof Mesh && child.geometry instanceof PlaneGeometry,
      ) as Mesh<PlaneGeometry, MeshStandardMaterial>;

    /** Puts the camera `distance` metres from the surface's centre, along the arch's axis. */
    function look(portal: PortalLandmark, ctx: WorldContext, distance: number): void {
      const centre = veilOf(portal).getWorldPosition(new Vector3());
      ctx.camera.position.set(centre.x, centre.y, centre.z + distance);
    }

    it('shows it whole while the camera is still well back', () => {
      const ctx = context();
      const portal = new PortalLandmark(options());
      portal.init(ctx);

      look(portal, ctx, VEIL_FADE + 1);
      portal.update(0.016, ctx);

      expect(veilOf(portal).visible).toBe(true);
      expect(veilOf(portal).material.opacity).toBeCloseTo(VEIL_OPACITY, 6);
    });

    it('fades it as the camera closes on it', () => {
      const ctx = context();
      const portal = new PortalLandmark(options());
      portal.init(ctx);

      look(portal, ctx, (VEIL_FADE + VEIL_HIDE) / 2);
      portal.update(0.016, ctx);

      expect(veilOf(portal).visible).toBe(true);
      expect(veilOf(portal).material.opacity).toBeCloseTo(VEIL_OPACITY / 2, 6);
    });

    it('stops drawing it once the camera is inside the arch', () => {
      const ctx = context();
      const portal = new PortalLandmark(options());
      portal.init(ctx);

      look(portal, ctx, VEIL_HIDE / 2);
      portal.update(0.016, ctx);

      // Not merely alpha 0: a full-screen double-sided transparent quad costs the same to shade
      // whether it changes the picture or not, which is the whole point of the fade.
      expect(veilOf(portal).visible).toBe(false);
    });

    it('follows the camera, not the player standing a boom away from it', () => {
      const ctx = context();
      const portal = new PortalLandmark(options());
      portal.init(ctx);
      ctx.player.teleport(portal.spawn.clone().setY(1.7), portal.spawnYaw);

      look(portal, ctx, VEIL_HIDE / 2);
      portal.update(0.016, ctx);

      expect(veilOf(portal).visible).toBe(false);
    });

    it('hides it for a visitor who asked for less motion too', () => {
      const ctx = context();
      const portal = new PortalLandmark(options({ reducedMotion: () => true }));
      portal.init(ctx);

      look(portal, ctx, VEIL_HIDE / 2);
      portal.update(0.016, ctx);

      expect(veilOf(portal).visible).toBe(false);
    });
  });

  it('enters only once per interaction', () => {
    const entered: string[] = [];
    const ctx = context();
    const portal = new PortalLandmark(options({ onEnter: (p) => entered.push(p.slug) }));
    portal.init(ctx);

    portal.interactables[0].onInteract();
    portal.interactables[0].onInteract();
    portal.update(DOLLY_SECONDS * 2, ctx);
    portal.update(DOLLY_SECONDS * 2, ctx);

    expect(entered).toEqual(['deslopify']);
  });
});

describe('PortalLandmark with a glTF model', () => {
  const withModel = () => project({ position: [0, 0, -20], model: 'assets/models/arch.glb' });
  const ctxWith = (assets: StubAssets): WorldContext => ({ ...context(), assets });

  it('keeps the procedural arch until the player comes close', () => {
    const assets = new StubAssets();
    const portal = new PortalLandmark(options({ project: withModel() }));
    const ctx = ctxWith(assets);
    portal.init(ctx);
    ctx.player.teleport(new Vector3(0, 1.7, 60));

    portal.update(0.016, ctx);

    expect(assets.requested).toEqual([]);
    expect(portal.group.getObjectByName('proxy')).toBeDefined();
  });

  it('fetches the model once the player is within loading range, then swaps the proxy', async () => {
    const assets = new StubAssets();
    const portal = new PortalLandmark(options({ project: withModel() }));
    const ctx = ctxWith(assets);
    portal.init(ctx);
    ctx.player.teleport(new Vector3(0, 1.7, -20 + MODEL_LOAD_RADIUS - 1));

    portal.update(0.016, ctx);
    portal.update(0.016, ctx);
    expect(assets.requested).toEqual(['assets/models/arch.glb']);

    const model = new Group();
    await assets.resolve(model);

    expect(portal.group.getObjectByName('proxy')).toBeUndefined();
    expect(portal.group.getObjectByName('model')?.children).toContain(model);
  });

  it('releases the model on dispose', async () => {
    const assets = new StubAssets();
    const portal = new PortalLandmark(options({ project: withModel() }));
    const ctx = ctxWith(assets);
    portal.init(ctx);
    ctx.player.teleport(new Vector3(0, 1.7, -18));
    portal.update(0.016, ctx);
    await assets.resolve();

    portal.dispose();

    expect(assets.releasedModels).toEqual(['assets/models/arch.glb']);
  });

  it('keeps the procedural arch and tries again later when the model fails to load', async () => {
    const assets = new StubAssets();
    const portal = new PortalLandmark(options({ project: withModel() }));
    const ctx = ctxWith(assets);
    portal.init(ctx);
    ctx.player.teleport(new Vector3(0, 1.7, -18));
    portal.update(0.016, ctx);

    await assets.reject();
    portal.update(0.016, ctx);

    expect(portal.group.getObjectByName('proxy')).toBeDefined();
    expect(assets.requested.length).toBe(2);
  });

  it('never asks for a model when the project has none', () => {
    const assets = new StubAssets();
    const portal = new PortalLandmark(options({ project: project({ model: undefined }) }));
    const ctx = ctxWith(assets);
    portal.init(ctx);
    ctx.player.teleport(new Vector3(0, 1.7, -18));

    portal.update(0.016, ctx);

    expect(assets.requested).toEqual([]);
  });
});
