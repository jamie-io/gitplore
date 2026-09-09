import { TestBed } from '@angular/core/testing';
import { InputService } from './input.service';

const STEP = 1 / 60;

function press(code: string, options: KeyboardEventInit = {}) {
  document.dispatchEvent(new KeyboardEvent('keydown', { code, ...options }));
}
function release(code: string) {
  document.dispatchEvent(new KeyboardEvent('keyup', { code }));
}
function lock(canvas: HTMLCanvasElement | null) {
  Object.defineProperty(document, 'pointerLockElement', { value: canvas, configurable: true });
  document.dispatchEvent(new Event('pointerlockchange'));
}
function moveMouse(movementX: number, movementY: number) {
  document.dispatchEvent(new MouseEvent('mousemove', { movementX, movementY }));
}

describe('InputService', () => {
  let input: InputService;
  let canvas: HTMLCanvasElement;
  let detach: () => void;

  beforeEach(() => {
    TestBed.resetTestingModule();
    input = TestBed.inject(InputService);
    canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    detach = input.attach(canvas);
  });

  afterEach(() => {
    detach();
    lock(null);
    canvas.remove();
  });

  describe('movement keys', () => {
    it('reads W as forward', () => {
      press('KeyW');
      expect(input.consumeIntent(STEP).forward).toBe(1);
    });

    it('reads S as backward', () => {
      press('KeyS');
      expect(input.consumeIntent(STEP).forward).toBe(-1);
    });

    it('reads A and D as strafing', () => {
      press('KeyA');
      expect(input.consumeIntent(STEP).strafe).toBe(-1);
      release('KeyA');
      press('KeyD');
      expect(input.consumeIntent(STEP).strafe).toBe(1);
    });

    it('reads the up arrow as forward too', () => {
      press('ArrowUp');
      expect(input.consumeIntent(STEP).forward).toBe(1);
    });

    it('turns rather than strafes on the left and right arrows', () => {
      press('ArrowRight');
      const intent = input.consumeIntent(STEP);

      expect(intent.yawDelta).toBeGreaterThan(0);
      expect(intent.strafe).toBe(0);
    });

    it('stops moving once the key is released', () => {
      press('KeyW');
      release('KeyW');
      expect(input.consumeIntent(STEP).forward).toBe(0);
    });

    it('treats shift as running and space as jumping', () => {
      press('ShiftLeft');
      press('Space');
      const intent = input.consumeIntent(STEP);

      expect(intent.run).toBe(true);
      expect(intent.jump).toBe(true);
    });
  });

  describe('mouse look', () => {
    it('turns pointer movement into yaw and pitch while locked', () => {
      lock(canvas);
      moveMouse(100, 50);

      const intent = input.consumeIntent(STEP);

      expect(intent.yawDelta).toBeGreaterThan(0);
      expect(intent.pitchDelta).toBeGreaterThan(0);
    });

    it('clears the accumulated movement once consumed', () => {
      lock(canvas);
      moveMouse(100, 50);
      input.consumeIntent(STEP);

      expect(input.consumeIntent(STEP).yawDelta).toBe(0);
    });

    it('ignores pointer movement while the pointer is not locked', () => {
      moveMouse(100, 50);

      expect(input.consumeIntent(STEP).yawDelta).toBe(0);
    });

    it('reports the lock state as a signal', () => {
      expect(input.locked()).toBe(false);
      lock(canvas);
      expect(input.locked()).toBe(true);
    });
  });

  describe('input modes', () => {
    it('ignores world input while the UI has focus', () => {
      input.setMode('ui');
      press('KeyW');

      expect(input.consumeIntent(STEP).forward).toBe(0);
    });

    it('resumes world input when the mode goes back', () => {
      input.setMode('ui');
      press('KeyW');
      expect(input.consumeIntent(STEP).forward).toBe(0);

      input.setMode('world');
      press('KeyW');

      expect(input.consumeIntent(STEP).forward).toBe(1);
    });
  });

  describe('one-shot actions', () => {
    it('queues an interact action for E and hands it out once', () => {
      press('KeyE');

      expect([...input.consumeActions()]).toEqual(['interact']);
      expect([...input.consumeActions()]).toEqual([]);
    });

    it('queues the menu on M and the exit on Escape', () => {
      press('KeyM');
      press('Escape');

      expect([...input.consumeActions()].sort()).toEqual(['exit', 'menu']);
    });

    it('still reports Escape while the UI has focus, so overlays can close', () => {
      input.setMode('ui');
      press('Escape');

      expect([...input.consumeActions()]).toEqual(['exit']);
    });

    it('reports the menu key in ui mode too, so the menu can be closed with it', () => {
      input.setMode('ui');
      press('KeyM');

      expect([...input.consumeActions()]).toEqual(['menu']);
    });

    it('does not report interact while the UI has focus', () => {
      input.setMode('ui');
      press('KeyE');

      expect([...input.consumeActions()]).toEqual([]);
    });

    it('tells listeners about actions as they happen, even between frames', () => {
      const seen: string[] = [];
      input.addActionListener((action) => seen.push(action));

      press('KeyE');
      press('KeyM');

      expect(seen).toEqual(['interact', 'menu']);
    });

    it('stops telling a listener once it unsubscribes', () => {
      const seen: string[] = [];
      const off = input.addActionListener((action) => seen.push(action));
      off();

      press('KeyE');

      expect(seen).toEqual([]);
    });

    it('leaves keys typed into a form field alone', () => {
      const field = document.createElement('input');
      document.body.appendChild(field);
      field.focus();

      field.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyM', bubbles: true }));

      expect([...input.consumeActions()]).toEqual([]);
      field.remove();
    });
  });

  it('stops listening after detach', () => {
    detach();
    press('KeyW');

    expect(input.consumeIntent(STEP).forward).toBe(0);
  });
});
