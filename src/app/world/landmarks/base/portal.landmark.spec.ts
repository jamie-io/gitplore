import { PerspectiveCamera, Scene } from 'three';
import { qualitySettings } from '@engine/capability.service';
import { PlayerController } from '@engine/player/player-controller';
import { WorldContext } from '@engine/world-object';
import { PROJECTS } from '@content/projects';
import { Project } from '@content/project.model';
import { LandmarkOptions, SPAWN_DISTANCE } from './landmark';
import { DOLLY_SECONDS, PortalLandmark } from './portal.landmark';

const FLAT = { heightAt: () => 0 };

function project(overrides: Partial<Project['landmark']> = {}): Project {
  const base = PROJECTS.find((p) => p.slug === 'deslopify')!;
  return { ...base, landmark: { ...base.landmark, ...overrides } };
}

function options(overrides: Partial<LandmarkOptions> = {}): LandmarkOptions {
  return {
    project: project(),
    ground: FLAT,
    reducedMotion: false,
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
    expect(portal.group.children.length).toBeGreaterThan(2);

    portal.dispose();
    expect(ctx.scene.children).not.toContain(portal.group);
  });

  it('enters at once under reduced motion', () => {
    const entered: string[] = [];
    const portal = new PortalLandmark(
      options({ reducedMotion: true, onEnter: (p) => entered.push(p.slug) }),
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
