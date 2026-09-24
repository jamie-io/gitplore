import { Material, Mesh, Object3D, Texture, Vector3 } from 'three';
import { qualitySettings } from '@engine/capability.service';
import type { Interactable } from '@engine/interaction/interactable';
import { FACING_THRESHOLD } from '@engine/interaction/interaction.system';
import { PLAYER_EYE_HEIGHT } from '@engine/player/player-controller';
import type { WorldContext } from '@engine/world-object';
import { stubContext } from '@engine/testing/world-context';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import { JungleEnvironment } from '../../environments/jungle';
import {
  ARCH,
  CARD_SLOTS,
  LANTERN_POST,
  SPAWN,
  TAG_SLOTS,
  WALL_SLOT,
  jungleHeightAt,
} from '../../environments/jungle-layout';
import { clearance } from '../../environments/testing/clearance';
import { PROMPTS, POSTER } from './deslopify.data';
import { FLOW } from './deslopify.flow';
import { CARD_STAGGER, DEMO_STAND, DeslopifyScene, TAG_HEIGHT } from './deslopify.scene';

const PROJECT = PROJECT_FIXTURES.find((project) => project.slug === 'deslopify')!;

interface Built {
  readonly target: DeslopifyScene;
  readonly environment: JungleEnvironment;
  readonly ctx: WorldContext;
  readonly statuses: (string | null)[];
  setReduced(on: boolean): void;
}

function build(options: { reduced?: boolean; init?: boolean; ctx?: WorldContext } = {}): Built {
  let reduced = options.reduced ?? false;
  const statuses: (string | null)[] = [];
  const environment = new JungleEnvironment({ reducedMotion: () => reduced });
  const target = new DeslopifyScene({
    environment,
    project: PROJECT,
    reducedMotion: () => reduced,
    onOpenInfo: () => undefined,
    onLeave: () => undefined,
    onStatus: (status) => statuses.push(status),
    textures: { load: () => new Texture(), release: () => undefined },
  });
  const ctx = options.ctx ?? stubContext();
  if (options.init ?? true) {
    target.init(ctx);
  }
  return { target, environment, ctx, statuses, setReduced: (on) => (reduced = on) };
}

/** Puts the player at (x, z) on the ground, looking along `yaw`. */
function stand(ctx: WorldContext, point: { x: number; z: number }, yaw = 0): void {
  ctx.player.teleport(
    new Vector3(point.x, jungleHeightAt(point.x, point.z) + PLAYER_EYE_HEIGHT, point.z),
    yaw,
  );
}

/** Runs `seconds` of frames as the engine does: the figure follows the player, then the world. */
function run(built: Built, seconds: number, dt = 1 / 30): void {
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    built.target.avatar.sync(built.ctx.player, dt);
    built.target.update(dt, built.ctx);
  }
}

function prompts(target: DeslopifyScene): string[] {
  return target.interactables.map((interactable) => interactable.prompt);
}

function find(target: DeslopifyScene, prompt: string): Interactable | undefined {
  return target.interactables.find((interactable) => interactable.prompt === prompt);
}

/** The interaction system's test for a prompt the player is standing at and facing. */
function reachable(ctx: WorldContext, interactable: Interactable): boolean {
  const dx = interactable.position.x - ctx.player.position.x;
  const dz = interactable.position.z - ctx.player.position.z;
  const distance = Math.hypot(dx, dz);
  const facing = (dx * -Math.sin(ctx.player.yaw) + dz * -Math.cos(ctx.player.yaw)) / distance;
  return distance > 0 && distance <= interactable.radius && facing >= FACING_THRESHOLD;
}

/** Walks the player under the arch and lets the flow see it. */
function crossArch(built: Built): void {
  stand(built.ctx, ARCH, 0);
  run(built, 1 / 30);
}

/** Three metres in front of the wall, facing it. */
function atWall(built: Built): void {
  const front = new Vector3(Math.sin(WALL_SLOT.yaw), 0, Math.cos(WALL_SLOT.yaw));
  stand(built.ctx, WALL_SLOT.position.clone().addScaledVector(front, 3), WALL_SLOT.yaw);
}

describe('DeslopifyScene', () => {
  describe('composition', () => {
    it('stands four feed cards along the south trail and the four-card wall on the north bank', () => {
      const { target, ctx } = build();

      expect(target.cards).toHaveLength(4);
      target.cards.forEach((card, index) => {
        expect(card.object.position.x).toBeCloseTo(CARD_SLOTS[index].position.x, 6);
        expect(card.object.position.z).toBeCloseTo(CARD_SLOTS[index].position.z, 6);
        expect(card.object.rotation.y).toBeCloseTo(CARD_SLOTS[index].yaw, 6);
        expect(card.object.parent).toBe(ctx.scene);
      });
      expect(target.wall.cards).toHaveLength(4);
      expect(target.wall.object.position.x).toBeCloseTo(WALL_SLOT.position.x, 6);
      expect(target.wall.object.position.z).toBeCloseTo(WALL_SLOT.position.z, 6);
      // Eight cards in all, and nothing else in the world carries a title pair.
      const faces: Object3D[] = [];
      ctx.scene.traverse((child) => {
        if (child.name === 'feed-card-face') faces.push(child);
      });
      expect(faces).toHaveLength(8);
      expect(ctx.scene.getObjectByName('jungle-sign')).toBeUndefined();
      expect(ctx.scene.getObjectByName('video-wall')).toBeUndefined();
    });

    it('stands every wall card on its own ground', () => {
      const { target } = build();

      for (const card of target.wall.cards) {
        const at = card.object.getWorldPosition(new Vector3());
        expect(at.y).toBeCloseTo(jungleHeightAt(at.x, at.z), 5);
      }
    });

    it('stands the lantern on its post, vines and tags in the canopy line', () => {
      const { target, ctx } = build();

      const lantern = ctx.scene.getObjectByName('deslopify:lantern')!;
      expect(lantern.position.x).toBeCloseTo(LANTERN_POST.x, 6);
      expect(lantern.position.z).toBeCloseTo(LANTERN_POST.z, 6);
      expect(target.vines.object.parent).toBe(ctx.scene);
      expect(target.tags.object.parent).toBe(ctx.scene);
    });

    it('hangs the tags at eye level, 2.2–2.9 m over the ground, turned to the trail', () => {
      const { target } = build();
      target.tags.object.updateMatrixWorld(true);

      TAG_SLOTS.forEach((slot, index) => {
        const face = target.tags.object.getObjectByName(`slop-tag-face:${index}`)!;
        const at = face.getWorldPosition(new Vector3());
        // Measured under the anchor, where the rope was cut to length.
        const height = at.y - jungleHeightAt(slot.position.x, slot.position.z);
        expect(height).toBeGreaterThanOrEqual(TAG_HEIGHT.min - 1e-6);
        expect(height).toBeLessThanOrEqual(TAG_HEIGHT.max + 1e-6);
        expect(target.tags.object.getObjectByName(`slop-tag:${index}`)!.rotation.y).toBe(slot.yaw);
      });
    });

    it('blocks the lantern post and the cards as well as the environment', () => {
      const { target, environment } = build({ init: false });

      expect(target.colliders).toEqual(expect.arrayContaining([...target.lantern.colliders]));
      for (const slot of CARD_SLOTS) {
        expect(clearance(slot.position.x, slot.position.z, target.colliders)).toBeLessThan(0);
      }
      expect(target.colliders.length).toBeGreaterThan(environment.colliders.length + 8);
    });

    it('keeps the arrival and the trail past the lantern free', () => {
      const { target } = build({ init: false });

      const { x, z } = target.arrival.position;
      expect(clearance(x, z, target.colliders)).toBeGreaterThan(0.5);
      for (const slot of CARD_SLOTS) {
        const front = new Vector3(Math.sin(slot.yaw), 0, Math.cos(slot.yaw));
        const reading = slot.position.clone().addScaledVector(front, 2);
        expect(clearance(reading.x, reading.z, target.colliders)).toBeGreaterThan(0.5);
      }
    });

    it('offers the jungle cave behind the waterfall', () => {
      const { target, environment } = build({ init: false });

      expect(target.colliders).toEqual(expect.arrayContaining([...environment.cave.colliders]));
      expect(target.interactables).toEqual(
        expect.arrayContaining([...environment.cave.interactables]),
      );
    });

    it('gives the exhibit poster its kicker, English line and before-and-after', () => {
      const { target } = build({ init: false });
      const exhibit = (target as unknown as { exhibit: Record<string, unknown> }).exhibit;

      expect(exhibit['kicker']).toBe('Projekt · Browser-Erweiterung');
      expect(exhibit['englishSummary']).toBe(
        'Remove AI auto-translated titles, thumbnails, descriptions, and audio from YouTube.',
      );
      expect(exhibit['comparison']).toEqual({
        without: 'Ich habe eine Tastatur von Kratzer gebaut',
        with: 'I built a keyboard from scratch',
      });
      expect(exhibit['comparison']).toEqual(POSTER.comparison);
    });
  });

  describe('the lantern', () => {
    it('offers to light it at its post, and lights when the visitor walks up to it', () => {
      const built = build();
      expect(prompts(built.target)).toContain(PROMPTS.lanternOn);

      stand(built.ctx, LANTERN_POST.clone().add(new Vector3(FLOW.ignitionRadius - 0.3, 0, 0)));
      run(built, 1 / 30);

      expect(built.target.flow.lantern).toBe('lit');
      expect(find(built.target, PROMPTS.lanternOn)).toBeUndefined();
    });

    it('lights from E at the post', () => {
      const built = build();

      find(built.target, PROMPTS.lanternOn)!.onInteract();
      run(built, 0.2);

      expect(built.target.flow.lantern).toBe('lit');
      expect(built.target.lantern.glow).toBeGreaterThan(0);
    });

    it('goes into the explorer’s hand and lights the way', () => {
      const built = build();
      stand(built.ctx, LANTERN_POST);
      run(built, 1.5);

      expect(built.target.flow.lantern).toBe('carried');
      const body = built.ctx.scene.getObjectByName('lantern-body')!;
      expect(body.parent?.name).toBe('explorer-hand');
      const at = built.target.lantern.worldPosition(new Vector3());
      const player = built.ctx.player.position;
      expect(Math.hypot(at.x - player.x, at.z - player.z)).toBeLessThan(1);
      expect(built.target.lantern.lightRadius).toBeCloseTo(5.5, 5);
    });

    it('wipes a card to its original as the visitor carries the light past it', () => {
      const built = build();
      stand(built.ctx, LANTERN_POST);
      run(built, 1.5);
      expect(built.target.cards[0].original).toBe(false);

      const slot = CARD_SLOTS[0];
      const front = new Vector3(Math.sin(slot.yaw), 0, Math.cos(slot.yaw));
      stand(built.ctx, slot.position.clone().addScaledVector(front, 2));
      run(built, 1.5);

      expect(built.target.cards[0].original).toBe(true);
      expect(built.target.cards[3].original).toBe(false);
      expect(built.statuses.at(-1)).toBe('Deslopify noch nicht · Entslopt 1/8');
    });

    it('offers E to put the carried lantern out and light it again, when nothing else is near', () => {
      const built = build({ reduced: true });
      stand(built.ctx, LANTERN_POST);
      run(built, 0.1);
      expect(built.target.flow.lantern).toBe('carried');

      const off = find(built.target, PROMPTS.lanternOff)!;
      expect(off).toBeDefined();
      expect(reachable(built.ctx, off)).toBe(true);
      off.onInteract();
      run(built, 0.1);

      expect(built.target.lantern.lightRadius).toBe(0);
      expect(find(built.target, PROMPTS.lanternOff)).toBeUndefined();
      find(built.target, PROMPTS.lanternOn)!.onInteract();
      run(built, 0.1);
      expect(built.target.lantern.lightRadius).toBeCloseTo(5.5, 5);
    });

    it('steps the lantern’s switch aside for anything else in reach', () => {
      const built = build({ reduced: true });
      crossArch(built);
      atWall(built);
      run(built, 0.1);

      expect(find(built.target, PROMPTS.lanternOff)).toBeUndefined();
      expect(reachable(built.ctx, find(built.target, PROMPTS.wallOff)!)).toBe(true);
    });
  });

  describe('the arch and the wall', () => {
    it('shows no wall switch before Deslopify is installed, and its E does nothing', () => {
      const built = build();
      atWall(built);
      run(built, 0.5);

      expect(prompts(built.target)).not.toContain(PROMPTS.wallOff);
      expect(prompts(built.target)).not.toContain(PROMPTS.wallOn);
      built.target.toggleWall();
      run(built, 0.1);
      expect(built.target.flow.installed).toBe(false);
      expect(built.statuses.at(-1)).toBe('Deslopify noch nicht · Entslopt 0/8');
    });

    it('installs under the arch: the ring spreads, the haze lifts, the clearing uniforms follow', () => {
      const built = build();
      expect(built.environment.slop).toBe(1);

      crossArch(built);
      expect(built.target.flow.installed).toBe(true);
      expect(built.statuses.at(-1)).toMatch(/^Deslopify an · Entslopt \d\/8$/);

      run(built, 2);
      const radius = built.target.flow.ring.radius;
      expect(radius).toBeGreaterThan(15);
      expect(built.environment.clearing.radius.value).toBe(radius);
      expect(built.environment.clearing.origin.value.x).toBe(ARCH.x);
      expect(built.environment.clearing.origin.value.z).toBe(ARCH.z);
      expect(built.environment.slop).toBe(built.target.flow.haze);
      expect(built.environment.slop).toBeLessThan(1);
      expect(built.target.ring.visible).toBe(true);
      expect(built.target.ring.scale.x).toBe(radius);
    });

    it('keeps everything original when the visitor walks back south with the lantern out', () => {
      const built = build({ reduced: true });
      crossArch(built);
      run(built, 1);
      expect(built.target.flow.clearedCards).toBe(8);

      // Lantern out, back at the arrival, for a good while.
      stand(built.ctx, SPAWN.position, 0);
      run(built, 0.1);
      built.target.toggleLantern();
      run(built, 20, 0.25);

      expect(built.target.lantern.lightRadius).toBe(0);
      expect(built.target.flow.state).toBe('an');
      expect(built.target.cards.every((card) => card.original)).toBe(true);
      expect(built.target.wall.cards.every((card) => card.original)).toBe(true);
      expect(built.environment.slop).toBe(0);
      expect(built.statuses.at(-1)).toBe('Deslopify an · Entslopt 8/8');
    });

    it('switches off at the wall so the slop grows back, and on again with a ring from the wall', () => {
      const built = build({ reduced: true });
      crossArch(built);
      run(built, 0.5);

      find(built.target, PROMPTS.wallOff)!.onInteract();
      stand(built.ctx, SPAWN.position, 0);
      run(built, 0.5);
      expect(built.target.flow.state).toBe('aus');
      expect(built.environment.slop).toBe(1);
      expect(built.environment.clearing.radius.value).toBe(0);
      expect(built.target.cards.some((card) => card.original)).toBe(false);
      expect(built.statuses.at(-1)).toBe('Deslopify aus · Entslopt 0/8');
      expect(prompts(built.target)).toContain(PROMPTS.wallOn);
      expect(prompts(built.target)).not.toContain(PROMPTS.wallOff);

      find(built.target, PROMPTS.wallOn)!.onInteract();
      run(built, 0.1);
      expect(built.target.flow.state).toBe('an');
      expect(built.target.flow.ring.origin.x).toBeCloseTo(WALL_SLOT.position.x, 6);
      expect(built.target.flow.ring.origin.z).toBeCloseTo(WALL_SLOT.position.z, 6);
    });

    it('staggers the wall’s cards that turn in the same frame by 120 ms', () => {
      const built = build();
      crossArch(built);
      stand(built.ctx, SPAWN.position, 0);
      run(built, 40, 0.5);
      expect(built.target.wall.cards.every((card) => card.original)).toBe(true);

      built.target.toggleWall();
      // Every card leaves the originals in the same frame; each starts 120 ms after the last.
      for (let frame = 0; frame < 120 && built.target.flow.cardOriginal(4); frame++) {
        run(built, 1 / 60, 1 / 60);
      }
      const before = built.target.wall.cards.map((card) => card.wipe);
      run(built, CARD_STAGGER, 1 / 60);
      const after = built.target.wall.cards.map((card) => card.wipe);

      expect(after[0]).toBeLessThan(before[0]);
      expect(after[3]).toBe(before[3]);
    });
  });

  describe('reduced motion', () => {
    it('snaps a ring, the haze and the wipes already in flight when switched on', () => {
      const built = build();
      crossArch(built);
      run(built, 1);
      expect(built.environment.slop).toBeGreaterThan(0.2);

      built.setReduced(true);
      run(built, 1 / 30);

      expect(built.target.flow.ring.radius).toBe(FLOW.ringMax);
      expect(built.target.ring.visible).toBe(false);
      expect(built.environment.slop).toBe(0);
      for (const card of [...built.target.cards, ...built.target.wall.cards]) {
        expect(card.wipe).toBe(1);
      }
    });
  });

  describe('try it in the world', () => {
    it('is a world-mode demo that puts the visitor at the wall with Deslopify on', () => {
      const built = build();
      const demo = built.target.demo;
      expect(demo.mode).toBe('world');

      demo.enter(built.ctx.player);
      run(built, 1 / 30);

      const front = new Vector3(Math.sin(WALL_SLOT.yaw), 0, Math.cos(WALL_SLOT.yaw));
      const expected = WALL_SLOT.position.clone().addScaledVector(front, DEMO_STAND);
      expect(built.ctx.player.position.x).toBeCloseTo(expected.x, 5);
      expect(built.ctx.player.position.z).toBeCloseTo(expected.z, 5);
      expect(built.target.flow.state).toBe('an');
      expect(built.target.flow.ring.origin.x).toBeCloseTo(WALL_SLOT.position.x, 6);
      expect(reachable(built.ctx, find(built.target, PROMPTS.wallOff)!)).toBe(true);

      demo.interact();
      expect(built.target.flow.state).toBe('aus');
    });

    it('switches a wall that was turned off back on', () => {
      const built = build({ reduced: true });
      crossArch(built);
      built.target.toggleWall();

      built.target.demo.enter(built.ctx.player);

      expect(built.target.flow.state).toBe('an');
    });
  });

  describe('lifecycle', () => {
    it('reports its state line on start, on change only, and clears it on leaving', () => {
      const built = build({ reduced: true });
      expect(built.statuses).toEqual(['Deslopify noch nicht · Entslopt 0/8']);

      run(built, 0.5);
      expect(built.statuses).toHaveLength(1);

      built.target.dispose();
      expect(built.statuses.at(-1)).toBeNull();
    });

    it('disposes every card, tag, vine, lantern and ring resource and empties the scene', () => {
      const built = build();
      stand(built.ctx, LANTERN_POST);
      run(built, 1.5);
      const owned = [
        ...built.target.cards.map((card) => card.object),
        built.target.wall.object,
        built.target.tags.object,
        built.target.vines.object,
        built.target.ring,
        built.ctx.scene.getObjectByName('deslopify:lantern')!,
        built.ctx.scene.getObjectByName('lantern-body')!,
      ];
      const materials = new Set<Material>();
      const textures = new Set<Texture>();
      for (const root of owned) {
        root.traverse((child) => {
          if (!(child instanceof Mesh)) return;
          for (const material of [child.material].flat() as Material[]) {
            materials.add(material);
            const map = (material as { map?: Texture | null }).map;
            for (const value of [map, material.userData['slopMap']]) {
              if (value instanceof Texture) textures.add(value);
            }
          }
        });
      }
      const spies = [...materials, ...textures].map((resource) => vi.spyOn(resource, 'dispose'));

      built.target.dispose();

      expect(textures.size).toBeGreaterThanOrEqual(8 * 2 + 15 * 2);
      expect(spies.every((spy) => spy.mock.calls.length >= 1)).toBe(true);
      expect(built.ctx.scene.children).toEqual([]);
    });

    it('starts over when the world is built again', () => {
      const first = build({ reduced: true });
      crossArch(first);
      first.target.dispose();

      const second = build({ reduced: true });

      expect(second.target.flow.installed).toBe(false);
      expect(second.target.flow.lantern).toBe('unlit');
      expect(second.environment.slop).toBe(1);
      expect(second.statuses).toEqual(['Deslopify noch nicht · Entslopt 0/8']);
    });

    it('runs the whole walk on the low tier', () => {
      const ctx = { ...stubContext(), quality: qualitySettings('low') };
      const built = build({ ctx });

      stand(built.ctx, LANTERN_POST);
      run(built, 1.5);
      crossArch(built);
      run(built, 1);

      expect(built.target.flow.state).toBe('an');
      expect(ctx.quality.shadows).toBe(false);
      built.target.dispose();
      expect(ctx.scene.children).toEqual([]);
    });
  });
});
