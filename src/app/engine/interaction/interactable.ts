import { Vector3 } from 'three';

/** Something the player can walk up to and use (IMPLEMENTATION_PLAN.md §2). */
export interface Interactable {
  readonly id: string;
  readonly position: Vector3;
  /** Metres within which the prompt appears. */
  readonly radius: number;
  /** Shown in the HUD as "E: <prompt>". */
  readonly prompt: string;
  onInteract(): void;
}
