import { Service, signal } from '@angular/core';
import { MoveIntent } from './player/player-controller';

export type InputMode = 'world' | 'ui' | 'demo' | 'captured';
export type InputAction =
  | 'interact'
  | 'menu'
  | 'exit'
  | 'view'
  | 'restart'
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | StationAction;

/** The number keys: 0 glides back to the portal, 1–8 to that station (spec §2). */
export type StationAction =
  | 'portal'
  | 'station1'
  | 'station2'
  | 'station3'
  | 'station4'
  | 'station5'
  | 'station6'
  | 'station7'
  | 'station8';

/** In number order, so a key's digit is its index here. */
export const STATION_ACTIONS: readonly StationAction[] = [
  'portal',
  'station1',
  'station2',
  'station3',
  'station4',
  'station5',
  'station6',
  'station7',
  'station8',
];

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
  // First or third person. The settings dialog holds the same choice; this is the one that is
  // discoverable without leaving the world.
  KeyV: 'view',
  KeyR: 'restart',
};

/** The top row and the keypad alike, `Digit3` and `Numpad3` both gliding to station 3. */
const STATION_KEYS: Readonly<Record<string, StationAction>> = Object.fromEntries(
  STATION_ACTIONS.flatMap((action, digit) => [
    [`Digit${digit}`, action],
    [`Numpad${digit}`, action],
  ]),
);

const CAPTURED_ACTION_KEYS: Record<string, InputAction> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

/** Actions that must work whatever has focus, otherwise an overlay could trap the visitor. */
const GLOBAL_ACTIONS: readonly InputAction[] = ['menu', 'exit'];

export type ActionListener = (action: InputAction) => void;
export type CaptureListener = (captured: boolean, prompt: string | null) => void;

/** The narrow control surface an in-world prop needs to take and release player input. */
export interface InputCapture {
  capture(prompt?: string): void;
  releaseCapture(): void;
  addCaptureListener(listener: CaptureListener): () => void;
}

/** Input surface for props that need capture plus one-shot actions while captured. */
export interface InputActionSource extends InputCapture {
  addActionListener(listener: ActionListener): () => void;
}

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || /^(input|textarea|select)$/i.test(target.tagName))
  );
}

/**
 * Keyboard and pointer state for the world (IMPLEMENTATION_PLAN.md §2). Nothing here writes to a
 * signal per frame: the render loop pulls an intent, and only the lock state and mode are signals.
 */
@Service()
export class InputService implements InputActionSource {
  readonly locked = signal(false);
  readonly mode = signal<InputMode>('world');

  private readonly pressed = new Set<string>();
  private readonly actions = new Set<InputAction>();
  private readonly listeners = new Set<ActionListener>();
  private readonly captureListeners = new Set<CaptureListener>();
  private captured = false;

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
      this.captured = false;
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

  /** Takes movement and look away from the visitor until they release the capture. */
  capture(prompt = 'Verlassen'): void {
    if (this.captured) {
      return;
    }

    this.captured = true;
    this.setMode('captured');
    this.captureListeners.forEach((listener) => listener(true, prompt));
  }

  /** Releases a captured control surface and returns to world input. */
  releaseCapture(): void {
    if (!this.captured) {
      return;
    }

    this.captured = false;
    this.setMode('world');
    this.captureListeners.forEach((listener) => listener(false, null));
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

  /**
   * Hears actions the moment the key goes down. The render loop may be paused while a menu is
   * open, so closing it cannot depend on the loop draining the queue.
   */
  addActionListener(listener: ActionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Hears capture transitions without requiring a render frame. */
  addCaptureListener(listener: CaptureListener): () => void {
    this.captureListeners.add(listener);
    return () => this.captureListeners.delete(listener);
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (isEditable(event.target)) {
      return;
    }

    if (this.mode() === 'captured') {
      if (event.code === 'Escape') {
        this.releaseCapture();
      } else if (
        event.code === 'KeyE' &&
        !event.repeat &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        this.releaseCapture();
      } else {
        const capturedAction = CAPTURED_ACTION_KEYS[event.code];
        if (capturedAction) {
          this.actions.add(capturedAction);
          this.listeners.forEach((listener) => listener(capturedAction));
        }
      }
      return;
    }

    // Only a visitor walking the world glides: a demo or a dialog has its own use for the digits,
    // and Ctrl or Cmd with a number switches the browser's tab.
    const station = STATION_KEYS[event.code];
    if (station) {
      if (
        this.mode() === 'world' &&
        !event.repeat &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        this.emit(station);
      }
      return;
    }

    const action = ACTION_KEYS[event.code];

    // A held key repeats; a view that flipped at the repeat rate would strobe the whole camera,
    // which is the last thing `prefers-reduced-motion` would forgive. Ctrl+V and Cmd+V are a
    // paste, not a view change — but Shift is the run key, so a running player may still press it.
    if (action === 'view' && (event.repeat || event.ctrlKey || event.metaKey || event.altKey)) {
      return;
    }

    if (action === 'menu' && (event.repeat || event.ctrlKey || event.metaKey || event.altKey)) {
      return;
    }

    if (action === 'restart' && (event.repeat || event.ctrlKey || event.metaKey || event.altKey)) {
      return;
    }

    if (action && (this.mode() !== 'ui' || GLOBAL_ACTIONS.includes(action))) {
      this.emit(action);
      return;
    }

    if (this.mode() === 'world') {
      this.pressed.add(event.code);
    }
  }

  private emit(action: InputAction): void {
    this.actions.add(action);
    this.listeners.forEach((listener) => listener(action));
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
