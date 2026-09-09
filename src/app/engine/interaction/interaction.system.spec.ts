import { Vector3 } from 'three';
import { PlayerController } from '../player/player-controller';
import { Interactable } from './interactable';
import { FACING_THRESHOLD, InteractionSystem } from './interaction.system';

function interactable(id: string, x: number, z: number, radius = 3): Interactable {
  return { id, position: new Vector3(x, 0, z), radius, prompt: id, onInteract: () => undefined };
}

describe('InteractionSystem', () => {
  let system: InteractionSystem;
  let player: PlayerController;
  let changes: (Interactable | null)[];

  beforeEach(() => {
    system = new InteractionSystem();
    player = new PlayerController();
    changes = [];
    system.onChange = (nearby) => changes.push(nearby);
  });

  it('finds an interactable straight ahead within its radius', () => {
    // Yaw 0 looks down -Z.
    const portal = interactable('portal', 0, -2);

    system.update(player, [portal]);

    expect(system.nearby).toBe(portal);
  });

  it('ignores one that is out of range', () => {
    system.update(player, [interactable('far', 0, -10)]);

    expect(system.nearby).toBeNull();
  });

  it('ignores one the player is not facing', () => {
    const behind = interactable('behind', 0, 2);

    system.update(player, [behind]);

    expect(system.nearby).toBeNull();
  });

  it('prefers the nearest of several candidates', () => {
    const near = interactable('near', 0, -1);
    const farther = interactable('farther', 0.5, -2.5);

    system.update(player, [farther, near]);

    expect(system.nearby).toBe(near);
  });

  it('reports a change only when the pick changes', () => {
    const portal = interactable('portal', 0, -2);

    system.update(player, [portal]);
    system.update(player, [portal]);
    system.update(player, []);
    system.update(player, []);

    expect(changes).toEqual([portal, null]);
  });

  it('demands a clear facing, not a glance', () => {
    expect(FACING_THRESHOLD).toBeCloseTo(0.4, 6);
    // Directly to the side: dot product 0, so not picked even though it is close.
    system.update(player, [interactable('side', 2, 0)]);

    expect(system.nearby).toBeNull();
  });

  it('forgets the current pick on reset', () => {
    const portal = interactable('portal', 0, -2);
    system.update(player, [portal]);

    system.reset();

    expect(system.nearby).toBeNull();
    expect(changes).toEqual([portal, null]);
  });
});
