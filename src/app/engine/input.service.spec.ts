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

    it('captures the controls and releases them exactly once', () => {
      const changes: { captured: boolean; prompt: string | null }[] = [];
      const off = input.addCaptureListener((captured, prompt) =>
        changes.push({ captured, prompt }),
      );

      input.capture('Aufstehen');
      input.capture('ignored');
      expect(input.mode()).toBe('captured');
      expect(changes).toEqual([{ captured: true, prompt: 'Aufstehen' }]);

      input.releaseCapture();
      input.releaseCapture();
      off();

      expect(input.mode()).toBe('world');
      expect(changes).toEqual([
        { captured: true, prompt: 'Aufstehen' },
        { captured: false, prompt: null },
      ]);
    });

    it('ignores movement and look while captured', () => {
      lock(canvas);
      input.capture();
      press('KeyW');
      press('ArrowRight');
      moveMouse(100, 50);

      expect(input.consumeIntent(STEP)).toEqual({
        forward: 0,
        strafe: 0,
        run: false,
        jump: false,
        yawDelta: 0,
        pitchDelta: 0,
      });
    });

    it('delivers captured arrow presses as actions without turning them into movement', () => {
      input.capture();
      press('ArrowUp');
      press('ArrowLeft');

      expect([...input.consumeActions()]).toEqual(['up', 'left']);
      expect(input.consumeIntent(STEP).forward).toBe(0);
      expect(input.consumeIntent(STEP).yawDelta).toBe(0);
    });

    it('releases capture on Escape or an unmodified first E press', () => {
      input.capture();
      press('Escape');
      expect(input.mode()).toBe('world');
      expect([...input.consumeActions()]).toEqual([]);

      input.capture();
      press('KeyE', { repeat: true });
      press('KeyE', { ctrlKey: true });
      expect(input.mode()).toBe('captured');

      press('KeyE');
      expect(input.mode()).toBe('world');
      expect([...input.consumeActions()]).toEqual([]);
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

    it('queues the view toggle on V', () => {
      press('KeyV');

      expect([...input.consumeActions()]).toEqual(['view']);
    });

    it('queues a restart action on R', () => {
      press('KeyR');

      expect([...input.consumeActions()]).toEqual(['restart']);
    });

    it('ignores a held V, so the camera cannot strobe at the key-repeat rate', () => {
      press('KeyV');
      input.consumeActions();

      press('KeyV', { repeat: true });

      expect([...input.consumeActions()]).toEqual([]);
    });

    it('leaves Ctrl+V and Cmd+V to the clipboard, but not Shift+V to the run key', () => {
      press('KeyV', { ctrlKey: true });
      press('KeyV', { metaKey: true });
      expect([...input.consumeActions()]).toEqual([]);

      press('KeyV', { shiftKey: true });
      expect([...input.consumeActions()]).toEqual(['view']);
    });

    it('leaves the view key alone while the UI has focus, where the select owns it', () => {
      input.setMode('ui');
      press('KeyV');

      expect([...input.consumeActions()]).toEqual([]);
    });

    it('ignores repeated or modified M presses, so a dialog cannot strobe', () => {
      press('KeyM');
      input.consumeActions();

      press('KeyM', { repeat: true });
      press('KeyM', { ctrlKey: true });
      press('KeyM', { metaKey: true });
      press('KeyM', { altKey: true });

      expect([...input.consumeActions()]).toEqual([]);
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

    it('reports interact in demo mode, so a demo can react to it', () => {
      input.setMode('demo');
      press('KeyE');

      expect([...input.consumeActions()]).toEqual(['interact']);
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

  describe('station keys', () => {
    it('glides to a station on its number and to the portal on 0', () => {
      press('Digit3');
      press('Digit0');
      press('Numpad5');

      expect([...input.consumeActions()]).toEqual(['station3', 'portal', 'station5']);
    });

    it('maps every number from 1 to 8, on the top row and the keypad', () => {
      for (let digit = 1; digit <= 8; digit++) {
        press(`Digit${digit}`);
        expect([...input.consumeActions()]).toEqual([`station${digit}`]);
        press(`Numpad${digit}`);
        expect([...input.consumeActions()]).toEqual([`station${digit}`]);
      }
      press('Digit9');
      expect([...input.consumeActions()]).toEqual([]);
    });

    it('leaves the number keys alone outside the world', () => {
      for (const mode of ['ui', 'demo'] as const) {
        input.setMode(mode);
        press('Digit3');
        press('Digit0');
        press('Numpad5');
        expect([...input.consumeActions()]).toEqual([]);
      }

      input.capture();
      press('Digit3');
      press('Digit0');
      press('Numpad5');
      expect([...input.consumeActions()]).toEqual([]);
    });

    it('ignores a held or modified number, which belongs to the browser', () => {
      press('Digit2', { repeat: true });
      press('Digit2', { ctrlKey: true });
      press('Digit2', { metaKey: true });
      press('Digit2', { altKey: true });

      expect([...input.consumeActions()]).toEqual([]);
    });
  });

  it('stops listening after detach', () => {
    detach();
    press('KeyW');

    expect(input.consumeIntent(STEP).forward).toBe(0);
  });
});
