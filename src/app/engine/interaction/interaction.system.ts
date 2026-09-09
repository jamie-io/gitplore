import { PlayerController } from '../player/player-controller';
import { Interactable } from './interactable';

/**
 * Cosine of the widest angle between the view direction and an interactable that still counts as
 * facing it (IMPLEMENTATION_PLAN.md §2).
 */
export const FACING_THRESHOLD = 0.4;

/**
 * Picks, every frame, the nearest interactable the player is close to and looking at, and reports
 * it only when the pick changes — so the store is written rarely, never per frame.
 */
export class InteractionSystem {
  onChange: ((nearby: Interactable | null) => void) | null = null;

  private current: Interactable | null = null;

  get nearby(): Interactable | null {
    return this.current;
  }

  update(player: PlayerController, interactables: readonly Interactable[]): void {
    this.set(pick(player, interactables));
  }

  reset(): void {
    this.set(null);
  }

  private set(next: Interactable | null): void {
    if (next === this.current) {
      return;
    }

    this.current = next;
    this.onChange?.(next);
  }
}

function pick(
  player: PlayerController,
  interactables: readonly Interactable[],
): Interactable | null {
  // Forward is -Z at yaw 0, as in the player controller.
  const forwardX = -Math.sin(player.yaw);
  const forwardZ = -Math.cos(player.yaw);

  let best: Interactable | null = null;
  let bestDistance = Infinity;

  for (const candidate of interactables) {
    const dx = candidate.position.x - player.position.x;
    const dz = candidate.position.z - player.position.z;
    const distance = Math.hypot(dx, dz);

    if (distance > candidate.radius || distance >= bestDistance || distance === 0) {
      continue;
    }

    const facing = (dx * forwardX + dz * forwardZ) / distance;
    if (facing < FACING_THRESHOLD) {
      continue;
    }

    best = candidate;
    bestDistance = distance;
  }

  return best;
}
