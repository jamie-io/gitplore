import {
  BufferGeometry,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Scene,
  Vector3,
} from 'three';
import { qualitySettings } from '@engine/capability.service';
import { Collider, HeightField, STEP_HEIGHT } from '@engine/player/collision';
import {
  JUMP_SPEED,
  MoveIntent,
  NO_INTENT,
  PLAYER_EYE_HEIGHT,
  PlayerController,
} from '@engine/player/player-controller';
import { MAX_RISE_LAG, TELEPORT_DISTANCE } from '@engine/player/third-person-rig';
import { StubAssets } from '@engine/testing/world-context';
import { WorldContext } from '@engine/world-object';
import { LICHTUNG } from '../environments/mood';
import { Explorer } from './explorer';

const FLAT: HeightField = { heightAt: () => 0 };
const FRAME = 1 / 60;

function context(tier: 'low' | 'medium' | 'high' = 'medium'): WorldContext {
  return {
    scene: new Scene(),
    camera: new PerspectiveCamera(),
    player: new PlayerController(),
    quality: qualitySettings(tier),
    assets: new StubAssets(),
  };
}

function built(ctx = context(), reducedMotion = () => false): Explorer {
  const explorer = new Explorer({ mood: LICHTUNG, reducedMotion });
  explorer.init(ctx);
  return explorer;
}

/** A named joint of the figure, which is how a test reaches one without opening the class up. */
function joint(explorer: Explorer, name: string): Object3D {
  const found = explorer.object.getObjectByName(name);
  if (!found) {
    throw new Error(`no joint called ${name}`);
  }
  return found;
}

function meshes(explorer: Explorer): Mesh[] {
  const found: Mesh[] = [];
  explorer.object.traverse((object) => {
    if (object instanceof Mesh) {
      found.push(object);
    }
  });
  return found;
}

function materialsOf(explorer: Explorer): Set<Material> {
  return new Set(meshes(explorer).map((part) => part.material as Material));
}

/** Drives the real controller and the figure together, which is the only honest walk cycle. */
function walk(
  explorer: Explorer,
  player: PlayerController,
  frames: number,
  intent: Partial<MoveIntent> = {},
  colliders: readonly Collider[] = [],
): void {
  for (let i = 0; i < frames; i++) {
    player.update(FRAME, { ...NO_INTENT, ...intent }, FLAT, colliders);
    explorer.sync(player, FRAME);
  }
}

/** A player already stood in front of the figure, so the next `sync` is a real step, not a spawn. */
function standing(explorer: Explorer, phase = 0): PlayerController {
  const player = new PlayerController();
  player.teleport(new Vector3(0, PLAYER_EYE_HEIGHT, 0));
  player.grounded = true;
  player.stridePhase = phase;
  explorer.sync(player, FRAME);
  return player;
}

/** Moves the player by hand and poses the figure for it: one step, in a chosen direction. */
function step(explorer: Explorer, player: PlayerController, dx: number, dz: number): void {
  player.position.x += dx;
  player.position.z += dz;
  explorer.sync(player, FRAME);
}

describe('Explorer', () => {
  it('holds no geometry until it is put in a world', () => {
    const explorer = new Explorer({ mood: LICHTUNG, reducedMotion: () => false });

    // A scene can be built and thrown away before `init`; anything allocated here would leak.
    expect(explorer.object.children).toEqual([]);
  });

  it('stands twelve meshes on three shared materials', () => {
    const explorer = built();

    expect(meshes(explorer)).toHaveLength(12);
    expect(materialsOf(explorer).size).toBe(3);
    // The symmetrical parts share a geometry, so nine of them carry the twelve meshes.
    expect(new Set(meshes(explorer).map((part) => part.geometry)).size).toBe(9);
  });

  it('puts the figure in the scene the world handed it', () => {
    const ctx = context();
    const explorer = built(ctx);

    expect(ctx.scene.children).toContain(explorer.object);
  });

  it('exposes a hand socket under the animated right shoulder', () => {
    const explorer = built();
    const rightShoulder = joint(explorer, 'explorer-shoulder-right');

    expect(explorer.hand.parent).toBe(rightShoulder);
    expect(explorer.object.getObjectById(explorer.hand.id)).toBe(explorer.hand);
  });

  it('cuts the coat from the world it stands in', () => {
    const explorer = built();
    const colours = [...materialsOf(explorer)].map((material) =>
      (material as MeshStandardMaterial).color.getHex(),
    );

    // The accent itself for the coat, and a darker tint of it for the boots, legs and head, so
    // the figure belongs to the place without disappearing into it.
    expect(colours).toContain(LICHTUNG.accent);
    expect(new Set(colours).size).toBe(3);
  });

  it('casts a shadow only on a tier that has shadows at all', () => {
    expect(meshes(built(context('high'))).every((part) => part.castShadow)).toBe(true);
    expect(meshes(built(context('low'))).some((part) => part.castShadow)).toBe(false);
  });

  describe('first person', () => {
    it('writes colour and depth while the body is meant to be seen', () => {
      const explorer = built();

      expect([...materialsOf(explorer)].every((m) => m.colorWrite && m.depthWrite)).toBe(true);
    });

    it('writes neither colour nor depth once the camera is in the head', () => {
      const explorer = built();

      explorer.setFirstPerson(true);

      expect([...materialsOf(explorer)].every((m) => !m.colorWrite && !m.depthWrite)).toBe(true);
    });

    it('keeps the shadow: still visible, still on layer 0, still casting', () => {
      const explorer = built(context('high'));

      explorer.setFirstPerson(true);

      // `object.visible = false` and a separate layer both take the shadow away with the body —
      // `WebGLShadowMap.renderObject` returns on the first and tests `layers` against the *main*
      // camera on the second. Only the write flags leave the shadow pass untouched.
      const camera = new PerspectiveCamera();
      expect(explorer.object.visible).toBe(true);
      meshes(explorer).forEach((part) => {
        expect(part.visible).toBe(true);
        expect((part.material as Material).visible).toBe(true);
        expect(part.layers.test(camera.layers)).toBe(true);
        expect(part.castShadow).toBe(true);
      });
    });

    it('keeps drawing on a tier that has shadows, so the shadow has something to come from', () => {
      const explorer = built(context('high'));

      explorer.setFirstPerson(true);

      expect(explorer.object.visible).toBe(true);
    });

    it('drops the draws on a tier with no shadows, where they would produce nothing', () => {
      const explorer = built(context('low'));

      explorer.setFirstPerson(true);
      expect(explorer.object.visible).toBe(false);

      explorer.setFirstPerson(false);
      expect(explorer.object.visible).toBe(true);
    });

    it('writes both again when the view goes back over the shoulder', () => {
      const explorer = built();

      explorer.setFirstPerson(true);
      explorer.setFirstPerson(false);

      expect([...materialsOf(explorer)].every((m) => m.colorWrite && m.depthWrite)).toBe(true);
    });

    it('applies a view that was chosen before the figure was built', () => {
      const explorer = new Explorer({ mood: LICHTUNG, reducedMotion: () => false });

      explorer.setFirstPerson(true);
      explorer.init(context());

      expect([...materialsOf(explorer)].every((m) => !m.colorWrite && !m.depthWrite)).toBe(true);
    });
  });

  describe('placing', () => {
    it('stands on the feet the controller found and turns with the yaw', () => {
      const explorer = built();
      const player = new PlayerController();
      player.teleport(new Vector3(3, PLAYER_EYE_HEIGHT + 2, -4), 1.2);

      explorer.sync(player, FRAME);

      expect(explorer.object.position.x).toBeCloseTo(3, 6);
      expect(explorer.object.position.y).toBeCloseTo(2, 6);
      expect(explorer.object.position.z).toBeCloseTo(-4, 6);
      expect(explorer.object.rotation.y).toBeCloseTo(1.2, 6);
    });

    it('places the soles using the controller eye height offset', () => {
      const explorer = built();
      const player = new PlayerController();
      player.setEyeHeightOffset(-0.7);
      player.teleport(new Vector3(3, 1, -4), 1.2);

      explorer.sync(player, FRAME);

      expect(explorer.object.position.y).toBeCloseTo(0, 6);
    });

    it('smooths a step up instead of popping the figure a whole step', () => {
      const explorer = built();
      const player = standing(explorer);

      // What stepping onto a crate does to the player: a whole `STEP_HEIGHT` between two frames.
      player.position.y += STEP_HEIGHT;
      explorer.sync(player, FRAME);

      const jumped = explorer.object.position.y;
      expect(jumped).toBeLessThan(STEP_HEIGHT * 0.5);

      for (let i = 0; i < 60; i++) {
        explorer.sync(player, FRAME);
      }
      expect(explorer.object.position.y).toBeCloseTo(STEP_HEIGHT, 2);
    });

    it('places the soles on a teleport instead of easing after it', () => {
      const explorer = built();
      const player = standing(explorer);

      // Dropped further than a run and a jump together could cover in one capped frame, which is
      // the same test `ThirdPersonRig` snaps its anchor on. Easing here would leave the figure a
      // whole `MAX_RISE_LAG` above the ground it now stands on — and above the boom's anchor.
      player.position.y -= TELEPORT_DISTANCE + 1;
      explorer.sync(player, FRAME);

      const sole = player.position.y - PLAYER_EYE_HEIGHT;
      expect(explorer.object.position.y).toBeCloseTo(sole, 6);
      expect(explorer.object.position.y - sole).toBeLessThan(MAX_RISE_LAG);
    });

    it('walks no legs on the frame it was teleported, because it covered no ground', () => {
      const explorer = built();
      const player = standing(explorer, Math.PI / 2);

      step(explorer, player, TELEPORT_DISTANCE + 1, 0);

      expect(joint(explorer, 'explorer-hip-left').rotation.x).toBe(0);
      expect(joint(explorer, 'explorer-hip-left').rotation.z).toBe(0);
    });
  });

  describe('walking', () => {
    it('swings the legs against each other, as far as a leg reaches', () => {
      const explorer = built();
      const player = new PlayerController();
      player.teleport(new Vector3(0, PLAYER_EYE_HEIGHT, 0));

      let widest = 0;
      for (let i = 0; i < 120; i++) {
        walk(explorer, player, 1, { forward: 1 });
        const left = joint(explorer, 'explorer-hip-left').rotation.x;
        const right = joint(explorer, 'explorer-hip-right').rotation.x;
        expect(left).toBeCloseTo(-right, 6);
        widest = Math.max(widest, Math.abs(left));
      }

      // A stride is 4 m of ground, so two seconds of walking passes through every phase.
      expect(widest).toBeGreaterThan(0.6);
    });

    it('swings the arms against the leg on the same side', () => {
      const explorer = built();
      const player = new PlayerController();
      player.teleport(new Vector3(0, PLAYER_EYE_HEIGHT, 0));
      walk(explorer, player, 40, { forward: 1 });

      const leg = joint(explorer, 'explorer-hip-left').rotation.x;
      const arm = joint(explorer, 'explorer-shoulder-left').rotation.x;

      expect(Math.abs(leg)).toBeGreaterThan(0.1);
      expect(Math.sign(arm)).toBe(-Math.sign(leg));
    });

    it('lifts the hips at mid-stance, not where the legs are furthest apart', () => {
      const explorer = built();
      const player = standing(explorer);
      const pelvis = joint(explorer, 'explorer-pelvis');

      // Both poses at the same full pace, so only the phase differs.
      player.stridePhase = 0;
      step(explorer, player, 0, -0.075);
      const together = pelvis.position.y;

      player.stridePhase = Math.PI / 2;
      step(explorer, player, 0, -0.075);
      const apart = pelvis.position.y;

      // A leg swung out by LEG_SWING lifts its own sole about 0.22 m; the hips have to be at their
      // lowest there, or the bob adds to that float instead of covering it.
      expect(together).toBeGreaterThan(apart);
    });

    it('stops the legs when a wall stops the player', () => {
      const explorer = built();
      const player = new PlayerController();
      player.teleport(new Vector3(0, PLAYER_EYE_HEIGHT, 0));
      const wall: Collider = { kind: 'aabb', minX: -5, maxX: 5, minZ: -4, maxZ: -3 };

      // Into the wall and held against it: the controller stops advancing `stridePhase`, and a
      // figure with a walk cycle of its own would carry on marching on the spot.
      walk(explorer, player, 120, { forward: 1 }, [wall]);
      const phase = player.stridePhase;
      walk(explorer, player, 30, { forward: 1 }, [wall]);

      expect(player.stridePhase).toBe(phase);
      expect(joint(explorer, 'explorer-hip-left').rotation.x).toBeCloseTo(0, 2);
    });

    it('swings the legs the other way when the player walks backwards', () => {
      const explorer = built();
      const forwards = standing(explorer, Math.PI / 2);
      step(explorer, forwards, 0, -0.07);
      const ahead = joint(explorer, 'explorer-hip-left').rotation.x;

      const other = built();
      const backwards = standing(other, Math.PI / 2);
      step(other, backwards, 0, 0.07);
      const behind = joint(other, 'explorer-hip-left').rotation.x;

      expect(ahead).toBeGreaterThan(0.1);
      expect(behind).toBeCloseTo(-ahead, 6);
    });

    it('scissors the legs sideways when the player strafes', () => {
      const explorer = built();
      const player = standing(explorer, Math.PI / 2);

      step(explorer, player, 0.07, 0);

      const hip = joint(explorer, 'explorer-hip-left');
      expect(Math.abs(hip.rotation.z)).toBeGreaterThan(0.05);
      expect(hip.rotation.x).toBeCloseTo(0, 6);
    });

    it('never crosses the feet through each other while strafing', () => {
      const explorer = built();
      const player = standing(explorer);
      const left = joint(explorer, 'explorer-boot-left');
      const right = joint(explorer, 'explorer-boot-right');
      const here = new Vector3();

      let closest = Infinity;
      let widest = 0;
      // A whole stride at full sideways pace, which is where the scissor is at its largest.
      for (let i = 1; i <= 48; i++) {
        player.stridePhase = (i / 48) * Math.PI * 2;
        step(explorer, player, 0.075, 0);
        explorer.object.updateMatrixWorld(true);

        const leftX = left.getWorldPosition(here).x;
        const rightX = right.getWorldPosition(here).x;
        // The yaw is 0, so world X is the body's own right: the left boot stays left of the right.
        const separation = rightX - leftX;
        closest = Math.min(closest, separation);
        widest = Math.max(widest, separation);
      }

      expect(closest).toBeGreaterThan(0);
      // …and the scissor is still worth animating: the stance opens and closes by ~19 cm.
      expect(widest - closest).toBeGreaterThan(0.1);
    });

    it('leaves the legs alone while the player stands still', () => {
      const explorer = built();
      const player = standing(explorer, Math.PI / 2);

      step(explorer, player, 0, 0);

      expect(joint(explorer, 'explorer-hip-left').rotation.x).toBe(0);
      expect(joint(explorer, 'explorer-hip-left').rotation.z).toBe(0);
    });
  });

  describe('in the air', () => {
    it('tucks the legs up and splays the arms while airborne', () => {
      const explorer = built();
      const player = standing(explorer);
      player.grounded = false;

      for (let i = 0; i < 30; i++) {
        explorer.sync(player, FRAME);
      }

      expect(joint(explorer, 'explorer-hip-left').rotation.x).toBeGreaterThan(0.3);
      expect(joint(explorer, 'explorer-hip-right').rotation.x).toBeGreaterThan(0.3);
      expect(joint(explorer, 'explorer-shoulder-left').rotation.z).toBeLessThan(-0.2);
      expect(joint(explorer, 'explorer-shoulder-right').rotation.z).toBeGreaterThan(0.2);
    });

    it('unfolds again on the way back down', () => {
      const explorer = built();
      const player = standing(explorer);
      player.grounded = false;
      for (let i = 0; i < 30; i++) {
        explorer.sync(player, FRAME);
      }

      player.grounded = true;
      for (let i = 0; i < 60; i++) {
        explorer.sync(player, FRAME);
      }

      expect(joint(explorer, 'explorer-hip-left').rotation.x).toBeCloseTo(0, 2);
    });

    it('gives at the knee on landing and springs back up', () => {
      const explorer = built();
      const player = standing(explorer);
      player.grounded = false;

      // Falling at the speed a jump takes off at: the hardest ordinary landing there is.
      for (let i = 0; i < 20; i++) {
        player.position.y -= JUMP_SPEED * FRAME;
        explorer.sync(player, FRAME);
      }
      player.grounded = true;
      explorer.sync(player, FRAME);

      const chest = joint(explorer, 'explorer-chest');
      expect(chest.position.y).toBeLessThan(-0.05);

      for (let i = 0; i < 60; i++) {
        explorer.sync(player, FRAME);
      }
      expect(chest.position.y).toBeCloseTo(0, 2);
    });

    it('drops harder from a longer fall than from a hop', () => {
      const land = (speed: number) => {
        const explorer = built();
        const player = standing(explorer);
        player.grounded = false;
        for (let i = 0; i < 20; i++) {
          player.position.y -= speed * FRAME;
          explorer.sync(player, FRAME);
        }
        player.grounded = true;
        explorer.sync(player, FRAME);
        return joint(explorer, 'explorer-chest').position.y;
      };

      expect(land(JUMP_SPEED)).toBeLessThan(land(JUMP_SPEED / 4));
    });
  });

  describe('reduced motion', () => {
    it('breathes while standing still', () => {
      const explorer = built();
      const player = standing(explorer);

      const heights = new Set<number>();
      for (let i = 0; i < 40; i++) {
        explorer.sync(player, FRAME);
        heights.add(joint(explorer, 'explorer-pelvis').position.y);
      }

      expect(heights.size).toBeGreaterThan(1);
    });

    it('holds still when the visitor asked for less motion', () => {
      const explorer = built(context(), () => true);
      const player = standing(explorer);

      const heights = new Set<number>();
      for (let i = 0; i < 40; i++) {
        explorer.sync(player, FRAME);
        heights.add(joint(explorer, 'explorer-pelvis').position.y);
      }

      expect(heights.size).toBe(1);
    });
  });

  describe('disposal', () => {
    it('frees every geometry and material and leaves the scene empty', () => {
      const ctx = context();
      const explorer = built(ctx);
      const freed = new Set<BufferGeometry | Material>();
      meshes(explorer).forEach((part) => {
        part.geometry.addEventListener('dispose', () => freed.add(part.geometry));
        const material = part.material as Material;
        material.addEventListener('dispose', () => freed.add(material));
      });

      explorer.dispose();

      // Nine geometries and three materials: exactly what `build` allocated.
      expect(freed.size).toBe(12);
      expect(ctx.scene.children).toEqual([]);
      expect(explorer.object.children).toEqual([]);
    });

    it('survives a sync after it has been disposed', () => {
      const explorer = built();
      const player = standing(explorer);

      explorer.dispose();

      expect(() => explorer.sync(player, FRAME)).not.toThrow();
    });
  });
});
