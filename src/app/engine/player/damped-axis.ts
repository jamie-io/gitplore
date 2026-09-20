/**
 * One axis of a critically damped spring, stepped from its closed form so the motion is the same at
 * any frame rate. `smoothing` is the spring's characteristic time: after it, under half the gap is
 * left, and after three times it the gap is gone. 0 means no easing at all, which is what reduced
 * motion asks for.
 *
 * It lives on its own because the camera rig and the player's avatar both have to smooth the same
 * `STEP_HEIGHT` teleport out of the same frame, and two springs with two implementations would
 * eventually disagree by a frame — which is exactly what would make the figure swim on screen.
 */
export class DampedAxis {
  value = 0;
  private velocity = 0;

  reset(value: number): void {
    this.value = value;
    this.velocity = 0;
  }

  /** `maxLag` caps how far behind the target the value may fall, however fast the target runs. */
  step(target: number, smoothing: number, dt: number, maxLag = Infinity): void {
    if (smoothing <= 0) {
      this.reset(target);
      return;
    }

    const rate = 2 / smoothing;
    const decay = Math.exp(-rate * dt);
    const lag = this.value - target;
    const slope = this.velocity + rate * lag;

    this.value = target + (lag + slope * dt) * decay;
    this.velocity = (this.velocity - slope * rate * dt) * decay;

    // Pinned at the cap the value travels with the target; the spring takes over again as soon as
    // the target stops running away from it, which is what turns a landing into a settle.
    if (this.value < target - maxLag) {
      this.value = target - maxLag;
      this.velocity = Math.max(this.velocity, 0);
    } else if (this.value > target + maxLag) {
      this.value = target + maxLag;
      this.velocity = Math.min(this.velocity, 0);
    }
  }
}
