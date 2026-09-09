import { Service, signal } from '@angular/core';
import { MoveIntent } from './player/player-controller';

export type InputMode = 'world' | 'ui' | 'demo';
export type InputAction = 'interact' | 'menu' | 'exit';

/** Radians of turn per pixel of pointer movement, before the user's sensitivity multiplier. */
const POINTER_SENSITIVITY = 0.0022;

/** Radians per second when turning with the arrow keys instead of the mouse. */
const KEY_TURN_SPEED = 1.8;

const FORWARD_KEYS = ['KeyW', 'ArrowUp'];
const BACKWARD_KEYS = ['KeyS', 'ArrowDown'];
const LEFT_KEYS = ['KeyA'];
const RIGHT_KEYS = ['KeyD'];
const RUN_KEYS = ['ShiftLeft', 'ShiftRight'];
const JUMP_KEYS = ['Space'];

const ACTION_KEYS: Record<string, InputAction> = {
  KeyE: 'interact',
  Enter: 'interact',
  KeyM: 'menu',
  Escape: 'exit',
};

/**
 * Keyboard and pointer state for the world (IMPLEMENTATION_PLAN.md §2). Nothing here writes to a
 * signal per frame: the render loop pulls an intent, and only the lock state and mode are signals.
 */
@Service()
export class InputService {
  readonly locked = signal(false);
  readonly mode = signal<InputMode>('world');

  private readonly pressed = new Set<string>();
  private readonly actions = new Set<InputAction>();

  private canvas: HTMLCanvasElement | null = null;
  private pointerX = 0;
  private pointerY = 0;

  /** Multiplier from `SettingsStore`; 1 is the default. */
  sensitivity = 1;

  attach(canvas: HTMLCanvasElement): () => void {
    this.canvas = canvas;

    const onKeyDown = (event: KeyboardEvent) => this.onKeyDown(event);
    const onKeyUp = (event: KeyboardEvent) => this.pressed.delete(event.code);
    const onMouseMove = (event: MouseEvent) => this.onMouseMove(event);
    const onLockChange = () => this.onLockChange();
    const onBlur = () => this.pressed.clear();

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('pointerlockchange', onLockChange);
    window.addEventListener('blur', onBlur);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('pointerlockchange', onLockChange);
      window.removeEventListener('blur', onBlur);
      this.pressed.clear();
      this.canvas = null;
    };
  }

  setMode(mode: InputMode): void {
    this.mode.set(mode);
    this.pressed.clear();
    this.pointerX = 0;
    this.pointerY = 0;

    if (mode === 'ui' && document.pointerLockElement === this.canvas) {
      document.exitPointerLock?.();
    }
  }

  requestLock(): void {
    if (this.mode() === 'world') {
      this.canvas?.requestPointerLock?.();
    }
  }

  /**
   * Reads the current intent and clears the accumulated pointer movement. `dt` is needed because
   * arrow-key turning is a rate, while pointer movement has already accumulated over the frame.
   */
  consumeIntent(dt: number): MoveIntent {
    if (this.mode() !== 'world') {
      return { forward: 0, strafe: 0, run: false, jump: false, yawDelta: 0, pitchDelta: 0 };
    }

    const yawFromKeys =
      (this.anyPressed(['ArrowRight']) ? 1 : 0) - (this.anyPressed(['ArrowLeft']) ? 1 : 0);

    const intent: MoveIntent = {
      forward: axis(this.anyPressed(FORWARD_KEYS), this.anyPressed(BACKWARD_KEYS)),
      strafe: axis(this.anyPressed(RIGHT_KEYS), this.anyPressed(LEFT_KEYS)),
      run: this.anyPressed(RUN_KEYS),
      jump: this.anyPressed(JUMP_KEYS),
      yawDelta:
        this.pointerX * POINTER_SENSITIVITY * this.sensitivity + yawFromKeys * KEY_TURN_SPEED * dt,
      pitchDelta: this.pointerY * POINTER_SENSITIVITY * this.sensitivity,
    };

    this.pointerX = 0;
    this.pointerY = 0;
    return intent;
  }

  /** Hands out the one-shot actions queued since the last call. */
  consumeActions(): ReadonlySet<InputAction> {
    const queued = new Set(this.actions);
    this.actions.clear();
    return queued;
  }

  private onKeyDown(event: KeyboardEvent): void {
    const action = ACTION_KEYS[event.code];

    // Escape has to work in every mode, otherwise an overlay could trap the visitor.
    if (action && (this.mode() === 'world' || action === 'exit')) {
      this.actions.add(action);
      return;
    }

    if (this.mode() === 'world') {
      this.pressed.add(event.code);
    }
  }

  private onMouseMove(event: MouseEvent): void {
    if (!this.locked() || this.mode() !== 'world') {
      return;
    }

    this.pointerX += event.movementX;
    this.pointerY += event.movementY;
  }

  private onLockChange(): void {
    this.locked.set(document.pointerLockElement === this.canvas && this.canvas !== null);
  }

  private anyPressed(codes: readonly string[]): boolean {
    return codes.some((code) => this.pressed.has(code));
  }
}

function axis(positive: boolean, negative: boolean): number {
  return (positive ? 1 : 0) - (negative ? 1 : 0);
}
