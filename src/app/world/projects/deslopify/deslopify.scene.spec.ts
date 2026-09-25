import { Material, Mesh, Object3D, Points, Texture, Vector3 } from 'three';
import { qualitySettings } from '@engine/capability.service';
import type { Interactable } from '@engine/interaction/interactable';
import { floorHeightAt } from '@engine/player/collision';
import { FACING_THRESHOLD } from '@engine/interaction/interaction.system';
import { PLAYER_EYE_HEIGHT } from '@engine/player/player-controller';
import type { WorldContext } from '@engine/world-object';
import { stubContext } from '@engine/testing/world-context';
import type { Project } from '@content/project.model';
import { PROJECT_FIXTURES } from '@content/testing/project-fixtures';
import { JungleEnvironment } from '../../environments/jungle';
import {
  ARCH,
  BAMBOO,
  BOARDWALK,
  CAIRN,
  CARD_SLOTS,
  DECK,
  FIREFLY_GLADE,
  LANTERN_POST,
  LIANA,
  PORTAL,
  STATION_STANDS,
  TAG_SLOTS,
  TOUR,
  WALL,
  glidePath,
  jungleHeightAt,
  nearestOnPath,
  pointAlong,
  stepCentres,
} from '../../environments/jungle-layout';
import { clearance } from '../../environments/testing/clearance';
import {
  MOMENT_BANNER,
  PITCH,
  PLATES,
  POSTER,
  PROMPTS,
  STATION_NAMES,
  TOASTS,
} from './deslopify.data';
import { FLOW } from './deslopify.flow';
import {
  CARD_STAGGER,
  DEMO_STAND,
  DeslopifyScene,
  TAG_HEIGHT,
  commitPeriods,
} from './deslopify.scene';

const PROJECT = PROJECT_FIXTURES.find((project) => project.slug === 'deslopify')!;

interface Built {
  readonly target: DeslopifyScene;
  readonly environment: JungleEnvironment;
  readonly ctx: WorldContext;
  readonly statuses: (string | null)[];
  readonly toasts: string[];
  readonly moments: string[];
  setReduced(on: boolean): void;
}

function build(
  options: { reduced?: boolean; init?: boolean; ctx?: WorldContext; project?: Project } = {},
): Built {
  let reduced = options.reduced ?? false;
  const statuses: (string | null)[] = [];
  const toasts: string[] = [];
  const moments: string[] = [];
  const environment = new JungleEnvironment({ reducedMotion: () => reduced });
  const target = new DeslopifyScene({
    environment,
    project: options.project ?? PROJECT,
    reducedMotion: () => reduced,
    onOpenInfo: () => undefined,
    onLeave: () => undefined,
    onStatus: (status) => statuses.push(status),
    onToast: (text) => toasts.push(text),
    onMoment: (banner) => moments.push(banner),
    textures: { load: () => new Texture(), release: () => undefined },
  });
  const ctx = options.ctx ?? stubContext();
  if (options.init ?? true) {
    target.init(ctx);
    // Where visitors arrive, rather than the world's origin, which is under the arch.
    stand(ctx, PORTAL, PORTAL.yaw);
  }
  return {
    target,
    environment,
    ctx,
    statuses,
    toasts,
    moments,
    setReduced: (on) => (reduced = on),
  };
}

/** The walkable surface at (x, z): the terrain, or the boardwalk and steps over it. */
function walkSurface(target: DeslopifyScene, x: number, z: number): number {
  return floorHeightAt(x, z, Infinity, target.ground, target.colliders);
}

/** The highest walkable surface under a tag at (x, z), across its width. */
function walkUnderTag(target: DeslopifyScene, x: number, z: number): number {
  let highest = walkSurface(target, x, z);
  for (let angle = 0; angle < Math.PI * 2 - 1e-9; angle += Math.PI / 4) {
    highest = Math.max(
      highest,
      walkSurface(target, x + Math.cos(angle) * 0.5, z + Math.sin(angle) * 0.5),
    );
  }
  return highest;
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

/** Walks the player under the arch, on the deck, and lets the flow see it. */
function crossArch(built: Built): void {
  built.ctx.player.teleport(new Vector3(ARCH.x, DECK.height + PLAYER_EYE_HEIGHT, ARCH.z), 0);
  run(built, 1 / 30);
}

/** Three metres in front of the wall, facing it. */
function atWall(built: Built): void {
  stand(built.ctx, inFront(WALL, 3), WALL.yaw);
}

/** `metres` in front of a prop, on the ground plane. */
function inFront(place: { x: number; z: number; yaw: number }, metres: number): Vector3 {
  return new Vector3(
    place.x + Math.sin(place.yaw) * metres,
    0,
    place.z + Math.cos(place.yaw) * metres,
  );
}

/** Only the colliders a visitor walks into, not the floors they walk on. */
function walls(target: DeslopifyScene) {
  return target.colliders.filter((collider) => collider.top === undefined);
}

describe('DeslopifyScene', () => {
  describe('composition', () => {
    it('stands four feed cards beside the boardwalk and the four-card wall on the glade', () => {
      const { target, ctx } = build();

      expect(target.cards).toHaveLength(4);
      target.cards.forEach((card, index) => {
        expect(card.object.position.x).toBeCloseTo(CARD_SLOTS[index].x, 6);
        expect(card.object.position.z).toBeCloseTo(CARD_SLOTS[index].z, 6);
        expect(card.object.rotation.y).toBeCloseTo(CARD_SLOTS[index].yaw, 6);
        expect(card.object.parent).toBe(ctx.scene);
      });
      expect(target.wall.cards).toHaveLength(4);
      expect(target.wall.object.position.x).toBeCloseTo(WALL.x, 6);
      expect(target.wall.object.position.z).toBeCloseTo(WALL.z, 6);
      // Eight cards in all, and nothing else in the world carries a title pair.
      const faces: Object3D[] = [];
      ctx.scene.traverse((child) => {
        if (child.name === 'feed-card-face') faces.push(child);
      });
      expect(faces).toHaveLength(8);
      expect(ctx.scene.getObjectByName('jungle-sign')).toBeUndefined();
      expect(ctx.scene.getObjectByName('video-wall')).toBeUndefined();
    });

    it('stands the wall’s cards on its ledge, shrunk to fit the 5.6 m wall', () => {
      const { target } = build();

      const base = target.wall.object.position.y;
      expect(base).toBeCloseTo(jungleHeightAt(WALL.x, WALL.z), 6);
      for (const card of target.wall.cards) {
        const at = card.object.getWorldPosition(new Vector3());
        expect(at.y - base).toBeCloseTo(0.3, 6);
        expect(Math.abs(at.x - WALL.x)).toBeLessThan(2.8);
        expect(card.object.getWorldScale(new Vector3()).x).toBeCloseTo(0.52, 6);
      }
    });

    it('loads the feed wall’s model with the scene', () => {
      const { ctx } = build();

      expect((ctx.assets as unknown as { requested: string[] }).requested).toContain(
        'assets/models/feed-wall.glb',
      );
    });

    it('stands the lantern on its post, vines and tags in the canopy line', () => {
      const { target, ctx } = build();

      const lantern = ctx.scene.getObjectByName('deslopify:lantern')!;
      expect(lantern.position.x).toBeCloseTo(LANTERN_POST.x, 6);
      expect(lantern.position.z).toBeCloseTo(LANTERN_POST.z, 6);
      expect(target.vines.object.parent).toBe(ctx.scene);
      expect(target.tags.object.parent).toBe(ctx.scene);
    });

    it('hangs the tags 2.2–2.9 m over the walk under them, turned to the boardwalk', () => {
      const { target } = build();
      target.tags.object.updateMatrixWorld(true);

      TAG_SLOTS.forEach((slot, index) => {
        const face = target.tags.object.getObjectByName(`slop-tag-face:${index}`)!;
        const at = face.getWorldPosition(new Vector3());
        // Measured from what the visitor walks on there: the boardwalk, the steps or the ground.
        const height = at.y - walkUnderTag(target, slot.x, slot.z);
        expect(height).toBeGreaterThanOrEqual(TAG_HEIGHT.min - 1e-6);
        expect(height).toBeLessThanOrEqual(TAG_HEIGHT.max + 1e-6);
        // Turned to the walk a little back towards the portal, where visitors come from.
        const back = pointAlong(BOARDWALK, nearestOnPath(slot.x, slot.z, BOARDWALK).along - 3);
        expect(target.tags.object.getObjectByName(`slop-tag:${index}`)!.rotation.y).toBeCloseTo(
          Math.atan2(back.x - slot.x, back.z - slot.z),
          10,
        );
      });
    });

    it('hangs the tag over the steps clear of a climber’s head', () => {
      const { target } = build();
      target.tags.object.updateMatrixWorld(true);
      const slot = TAG_SLOTS[3];
      const face = target.tags.object.getObjectByName('slop-tag-face:3')!;
      const bottom = face.getWorldPosition(new Vector3()).y - 0.21;

      // Under it and all round it, wherever a climber on the steps could stand.
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
        const x = slot.x + Math.cos(angle) * 0.45;
        const z = slot.z + Math.sin(angle) * 0.45;
        expect(bottom - walkSurface(target, x, z)).toBeGreaterThanOrEqual(2.1);
      }
      expect(walkSurface(target, slot.x, slot.z)).toBeGreaterThan(jungleHeightAt(slot.x, slot.z));
    });

    it('blocks the lantern post and the cards as well as the environment', () => {
      const { target, environment } = build({ init: false });

      expect(target.colliders).toEqual(expect.arrayContaining([...target.lantern.colliders]));
      for (const slot of CARD_SLOTS) {
        expect(clearance(slot.x, slot.z, target.colliders)).toBeLessThan(0);
      }
      expect(target.colliders.length).toBeGreaterThan(environment.colliders.length + 8);
    });

    it('keeps the arrival and the boardwalk in front of every card free', () => {
      const { target } = build({ init: false });

      const { x, z } = target.arrival.position;
      expect(clearance(x, z, walls(target))).toBeGreaterThan(0.5);
      for (const slot of CARD_SLOTS) {
        const reading = inFront(slot, 2);
        expect(clearance(reading.x, reading.z, walls(target))).toBeGreaterThan(0.5);
      }
    });

    it('keeps the jungle’s cliff, cave, deck and steps', () => {
      const { target, environment } = build({ init: false });

      expect(target.colliders).toEqual(
        expect.arrayContaining([
          ...environment.cave.colliders,
          ...environment.bridge.colliders,
          ...environment.steps.colliders,
        ]),
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
      expect(target.interactables.find((entry) => entry.id === 'landmark:deslopify')?.prompt).toBe(
        PROMPTS.exhibit,
      );
    });
  });

  describe('the lantern', () => {
    it('offers to light it at its post, and lights when the visitor walks up to it', () => {
      const built = build();
      expect(prompts(built.target)).toContain(PROMPTS.lanternOn);

      stand(built.ctx, { x: LANTERN_POST.x + FLOW.ignitionRadius - 0.3, z: LANTERN_POST.z });
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

    it('clears the ground haze around its light, and nowhere while it is dark', () => {
      const built = build({ reduced: true });
      const light = built.environment.groundHaze.uniforms.uHazeLight.value;
      run(built, 0.1);
      expect(light.z).toBe(0);

      stand(built.ctx, LANTERN_POST);
      run(built, 0.2);
      const at = built.target.lantern.worldPosition(new Vector3());
      expect(light.x).toBeCloseTo(at.x, 1);
      expect(light.y).toBeCloseTo(at.z, 1);
      expect(light.z).toBeCloseTo(built.target.lantern.lightRadius, 5);
      expect(light.z).toBeGreaterThan(0);

      find(built.target, PROMPTS.lanternOff)!.onInteract();
      run(built, 0.1);
      expect(light.z).toBe(0);
    });

    it('wipes a card to its original as the visitor carries the light past it', () => {
      const built = build();
      stand(built.ctx, LANTERN_POST);
      run(built, 1.5);
      expect(built.target.cards[0].original).toBe(false);

      const slot = CARD_SLOTS[0];
      stand(built.ctx, inFront(slot, 2));
      run(built, 1.5);

      expect(built.target.cards[0].original).toBe(true);
      expect(built.target.cards[3].original).toBe(false);
      // The boardwalk's cards stand close: the light may reach the next one along too.
      const cleared = built.target.cards.filter((card) => card.original).length;
      expect(cleared).toBeLessThan(4);
      expect(built.statuses.at(-1)).toBe(`Deslopify noch nicht · Entslopt ${cleared}/8`);
    });

    it('starts a card wipe on the frame its card becomes cleared', () => {
      const built = build();
      stand(built.ctx, LANTERN_POST);
      run(built, 1.5);

      const slot = CARD_SLOTS[0];
      stand(built.ctx, inFront(slot, 2));
      run(built, 1 / 60, 1 / 60);

      expect(built.target.flow.isCleared(slot.x, slot.z)).toBe(true);
      expect(built.target.flow.cardOriginal(0)).toBe(false);
      expect(built.target.cards[0].wipe).toBeGreaterThan(0);
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
      expect(built.environment.clearing.glow.value).toBe(built.target.flow.ringOpacity);
      expect(built.environment.clearing.glow.value).toBeGreaterThan(0);
      expect(built.target.ring.visible).toBe(true);
      expect(built.target.ring.scale.x).toBe(radius);
      // The band stands on the banks, not in the stream bed under the arch.
      expect(built.target.ring.position.y - 0.5).toBeGreaterThan(jungleHeightAt(ARCH.x, ARCH.z));
    });

    it('keeps everything original when the visitor walks back south with the lantern out', () => {
      const built = build({ reduced: true });
      crossArch(built);
      run(built, 1);
      expect(built.target.flow.clearedCards).toBe(8);

      // Lantern out, back at the arrival, for a good while.
      stand(built.ctx, PORTAL, 0);
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
      stand(built.ctx, PORTAL, 0);
      run(built, 0.5);
      expect(built.target.flow.state).toBe('aus');
      expect(built.environment.slop).toBe(1);
      expect(built.environment.clearing.radius.value).toBe(0);
      expect(built.environment.clearing.glow.value).toBe(0);
      expect(built.target.cards.some((card) => card.original)).toBe(false);
      expect(built.statuses.at(-1)).toBe('Deslopify aus · Entslopt 0/8');
      expect(prompts(built.target)).toContain(PROMPTS.wallOn);
      expect(prompts(built.target)).not.toContain(PROMPTS.wallOff);

      find(built.target, PROMPTS.wallOn)!.onInteract();
      run(built, 0.1);
      expect(built.target.flow.state).toBe('an');
      expect(built.target.flow.ring.origin.x).toBeCloseTo(WALL.x, 6);
      expect(built.target.flow.ring.origin.z).toBeCloseTo(WALL.z, 6);
    });

    it('staggers the wall’s cards that turn in the same frame by 120 ms', () => {
      const built = build();
      stand(built.ctx, LANTERN_POST);
      run(built, 1.5);
      expect(built.target.flow.lantern).toBe('carried');

      // The lit lantern arrives at the wall in one step: all four cards are in its light at once.
      atWall(built);
      run(built, 1 / 60, 1 / 60);
      const before = built.target.wall.cards.map((card) => card.wipe);
      run(built, CARD_STAGGER, 1 / 60);
      const after = built.target.wall.cards.map((card) => card.wipe);

      expect(before[0]).toBeGreaterThan(0);
      expect(after[0]).toBeGreaterThan(before[0]);
      expect(before[3]).toBe(0);
      expect(after[3]).toBe(0);
    });

    it('throws the wall’s lever when it switches, upright before the install', () => {
      const built = build({ reduced: true });
      run(built, 0.1);
      expect(built.target.wall.lever.rotation.x).toBe(0);

      crossArch(built);
      run(built, 0.1);
      const on = built.target.wall.lever.rotation.x;
      expect(Math.abs(on)).toBeGreaterThan(0.3);

      built.target.toggleWall();
      run(built, 0.1);
      expect(built.target.wall.lever.rotation.x).toBeCloseTo(-on, 6);
    });
  });

  describe('stations', () => {
    const project: Project = {
      ...PROJECT,
      commitBuckets: Array.from({ length: 52 }, (_, i) => (i < 20 ? 0 : i % 3)),
      languages: { JavaScript: 8100, HTML: 1600, Python: 250, Shell: 50 },
      releases: [
        { name: 'v1.0.0', date: '2025-06-01T00:00:00Z' },
        { name: 'v1.2.0', date: '2025-09-01T00:00:00Z' },
      ],
    };

    it('lists the seven stations in tour order, each 3 m wide, standing where the layout says', () => {
      const { target } = build({ init: false });

      expect(target.stations.map((station) => station.name)).toEqual([...STATION_NAMES]);
      expect(target.stations.map((station) => station.id)).toEqual([...TOUR]);
      target.stations.forEach((station, index) => {
        expect(station.stand).toBe(STATION_STANDS[TOUR[index]]);
        expect(station.trigger).toBe(3);
      });
      expect(target.stations[0].plate()).toEqual(PLATES.laterne);
      expect(target.stations[6].plate()).toEqual(PLATES.hoehle);
    });

    it('counts the project’s commits on the steps’ plate', () => {
      const { target } = build({ init: false, project });
      const total = project.commitBuckets!.reduce((sum, value) => sum + value, 0);

      expect(target.stations[2].plate()).toEqual(PLATES.stufen(total));
    });

    it('shows the wall’s plate for the state Deslopify is in', () => {
      const built = build({ reduced: true });
      const wand = built.target.stations[5];
      expect(wand.plate()).toEqual(PLATES.wandOff);

      crossArch(built);
      expect(wand.plate()).toEqual(PLATES.wandOn);

      built.target.restart(built.ctx.player);
      expect(wand.plate()).toEqual(PLATES.wandOff);
    });

    it('stands the portal, frames the bowl and pitches the project', () => {
      const { target } = build({ init: false });

      expect(target.portalStand).toBe(PORTAL);
      expect(target.overview).toEqual({
        position: { x: 0, y: 24, z: 36 },
        target: { x: 0, y: 0, z: -6 },
      });
      expect(target.pitch).toBe(PITCH);
      const from = STATION_STANDS.laterne;
      const to = STATION_STANDS.hoehle;
      expect(target.glidePath(from, to)).toEqual(glidePath(from, to));
    });

    it('shows the finds’ plates: portal, languages off the deck, cairn and liana', () => {
      const { target } = build({ init: false, project });

      expect(target.plateAt(PORTAL.x, PORTAL.z)).toEqual(PLATES.portal);
      expect(target.plateAt(PORTAL.x + 2.9, PORTAL.z)).toEqual(PLATES.portal);
      expect(target.plateAt(PORTAL.x + 3.1, PORTAL.z)).toBeNull();

      const langs = PLATES.langs('JavaScript 81 % · HTML 16 % · Python 3 % · Shell <1 %');
      expect(target.plateAt(BAMBOO[0].x - 1.5, BAMBOO[0].z)).toEqual(langs);
      // On the deck between the stalks the arch's station speaks, not the languages.
      expect(target.plateAt(ARCH.x, ARCH.z + 1)).toBeNull();

      expect(target.plateAt(CAIRN.x + 2.5, CAIRN.z)).toEqual(
        PLATES.cairn('v1.2.0 · 1. September 2025'),
      );
      expect(target.plateAt(CAIRN.x + 2.7, CAIRN.z)).toBeNull();
      expect(target.plateAt(LIANA.x + 2.5, LIANA.z)).toEqual(PLATES.liana);
      expect(target.plateAt(LIANA.x, LIANA.z + 2.7)).toBeNull();
    });

    it('says there is no release yet, and has no language plate without languages', () => {
      const { target } = build({ init: false });

      expect(target.plateAt(CAIRN.x, CAIRN.z)).toEqual(PLATES.cairn(null));
      expect(target.plateAt(BAMBOO[0].x - 1.5, BAMBOO[0].z)).toBeNull();
    });
  });

  describe('the commit steps', () => {
    it('splits the project’s history into eleven periods, a period with commits lighting', () => {
      expect(commitPeriods(undefined)).toEqual(Array(11).fill(false));
      // Four buckets over eleven periods: the last bucket falls in the last two.
      expect(commitPeriods([0, 0, 0, 5])).toEqual([...Array(9).fill(false), true, true]);
      const buckets = Array.from({ length: 22 }, (_, i) => (i === 21 ? 1 : 0));
      expect(commitPeriods(buckets)).toEqual([...Array(10).fill(false), true]);
    });

    it('lights a step with commits as the visitor comes by, and keeps it lit', () => {
      const project: Project = { ...PROJECT, commitBuckets: Array(52).fill(2) };
      const built = build({ project });
      const steps = stepCentres();

      stand(built.ctx, steps[0]);
      run(built, 0.1);
      expect(built.environment.steps.isLit(0)).toBe(true);
      expect(built.environment.steps.isLit(10)).toBe(false);

      stand(built.ctx, PORTAL);
      run(built, 0.1);
      expect(built.environment.steps.isLit(0)).toBe(true);
    });

    it('leaves a step dark whose period had no commits', () => {
      const project: Project = { ...PROJECT, commitBuckets: Array(52).fill(0) };
      const built = build({ project });

      stand(built.ctx, stepCentres()[0]);
      run(built, 0.1);

      expect(built.environment.steps.isLit(0)).toBe(false);
    });
  });

  describe('toasts and the moment', () => {
    it('says the lantern lit and the visitor is behind the falls', () => {
      const built = build();

      stand(built.ctx, LANTERN_POST);
      run(built, 0.1);
      stand(built.ctx, { x: 0, z: -19.6 });
      run(built, 0.5);

      expect(built.toasts).toEqual([TOASTS.lantern, TOASTS.falls]);
    });

    it('plays the moment once on the install from the arch, not on the wall, and again after a restart', () => {
      const built = build({ reduced: true });

      crossArch(built);
      run(built, 1);
      expect(built.moments).toEqual([MOMENT_BANNER]);

      built.target.toggleWall();
      built.target.toggleWall();
      run(built, 0.5);
      expect(built.moments).toEqual([MOMENT_BANNER]);
      expect(built.toasts).toContain(TOASTS.wallOff);
      expect(built.toasts).toContain(TOASTS.wallOn);

      built.target.restart(built.ctx.player);
      run(built, 0.1);
      crossArch(built);
      expect(built.moments).toEqual([MOMENT_BANNER, MOMENT_BANNER]);
    });

    it('installs when a single step carries the visitor through the arch', () => {
      const built = build({ reduced: true });
      stand(built.ctx, { x: 0, z: 3 });
      run(built, 1 / 30);

      built.ctx.player.teleport(new Vector3(0, jungleHeightAt(0, -3) + PLAYER_EYE_HEIGHT, -3), 0);
      run(built, 1 / 30);

      expect(built.target.flow.installed).toBe(true);
      expect(built.moments).toEqual([MOMENT_BANNER]);
    });

    it('does not play the moment when "try it in the world" installs at the wall', () => {
      const built = build();

      built.target.demo.enter(built.ctx.player);
      run(built, 0.1);

      expect(built.target.flow.installed).toBe(true);
      expect(built.moments).toEqual([]);
    });
  });

  describe('the fireflies', () => {
    function swarm(built: Built): Vector3[] {
      const points = built.ctx.scene.getObjectByName('star-lanterns') as Points;
      const attribute = points.geometry.getAttribute('position');
      return Array.from({ length: attribute.count }, (_, i) =>
        new Vector3().fromBufferAttribute(attribute, i),
      );
    }

    it('gather round the visitor who brings the lit lantern to the glade', () => {
      const built = build();
      stand(built.ctx, LANTERN_POST);
      run(built, 1.5);

      const near = { x: FIREFLY_GLADE.x + 1, z: FIREFLY_GLADE.z + 5 };
      stand(built.ctx, near);
      run(built, 3);

      for (const at of swarm(built)) {
        expect(Math.hypot(at.x - near.x, at.z - near.z)).toBeLessThan(2.5);
      }
    });

    it('burst from the liana’s pull, with a toast, and the jungle is scattered anew', () => {
      const built = build();
      const home = swarm(built);
      const reseed = vi.spyOn(built.environment, 'reseedDecoration');
      const liana = built.target.interactables.find((entry) =>
        entry.id.endsWith(':seed-lever:pull'),
      )!;

      liana.onInteract();
      run(built, 0.6);

      expect(built.toasts).toEqual([TOASTS.liana]);
      expect(reseed).toHaveBeenCalledTimes(1);
      const moved = swarm(built).filter((at, i) => at.distanceTo(home[i]) > 1);
      expect(moved.length).toBe(home.length);
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
      expect(demo.demoHint).toContain('R Neustart');

      demo.enter(built.ctx.player);
      run(built, 1 / 30);

      const expected = inFront(WALL, DEMO_STAND);
      expect(built.ctx.player.position.x).toBeCloseTo(expected.x, 5);
      expect(built.ctx.player.position.z).toBeCloseTo(expected.z, 5);
      expect(built.target.flow.state).toBe('an');
      expect(built.target.flow.ring.origin.x).toBeCloseTo(WALL.x, 6);
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

  describe('restart', () => {
    it('resets flow, lantern visuals, air, cards, and player position', () => {
      const built = build({ reduced: true });
      crossArch(built);
      run(built, 1);
      built.target.toggleWall();
      stand(built.ctx, WALL, WALL.yaw);

      built.target.restart(built.ctx.player);
      run(built, 1 / 30);

      expect(built.ctx.player.position.x).toBeCloseTo(PORTAL.x, 6);
      expect(built.ctx.player.position.z).toBeCloseTo(PORTAL.z, 6);
      // Facing north along the axis, as on arrival.
      expect(built.ctx.player.yaw).toBeCloseTo(PORTAL.yaw, 6);
      expect(built.target.flow.lantern).toBe('unlit');
      expect(built.target.flow.state).toBe('noch nicht');
      expect(built.target.flow.clearedCards).toBe(0);
      expect(built.target.lantern.lightRadius).toBe(0);
      expect(built.environment.slop).toBe(1);
      expect(built.target.vines.object.children.every((child) => child.scale.y === 1)).toBe(true);
      expect(built.target.tags.flipped(0)).toBe(false);
      expect(built.statuses.at(-1)).toBe('Deslopify noch nicht · Entslopt 0/8');
      expect(prompts(built.target)).toContain(PROMPTS.lanternOn);
      expect(stepCentres().some((_, i) => built.environment.steps.isLit(i))).toBe(false);
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

    it('does not republish unchanged HUD status text', () => {
      const built = build({ reduced: true });

      run(built, 1);

      expect(built.statuses).toEqual(['Deslopify noch nicht · Entslopt 0/8']);
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

      expect(textures.size).toBeGreaterThanOrEqual(8 * 2 + TAG_SLOTS.length * 2);
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
