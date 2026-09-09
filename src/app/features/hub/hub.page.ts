import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';

/**
 * Canvas host for the 3D world. M1 attaches `EngineService` here; the child outlet renders the
 * project panel over the still-running hub (IMPLEMENTATION_PLAN.md §3).
 */
@Component({
  selector: 'app-hub-page',
  imports: [RouterOutlet],
  template: `
    <canvas #canvas class="hub-canvas" aria-label="3D world" role="img"></canvas>
    <router-outlet />
  `,
  styles: `
    :host {
      display: block;
      block-size: 100dvh;
    }
    .hub-canvas {
      display: block;
      inline-size: 100%;
      block-size: 100%;
    }
  `,
})
export class HubPage {}
