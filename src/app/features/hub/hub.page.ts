import {
  Component,
  DestroyRef,
  afterNextRender,
  effect,
  inject,
  viewChild,
  ElementRef,
} from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { CapabilityService } from '@engine/capability.service';
import { ENGINE } from '@engine/engine.service';
import { InputService } from '@engine/input.service';
import { HubScene } from '@world/hub/hub.scene';
import { Hud } from '@ui/hud/hud';
import { SettingsStore } from '@ui/store/settings.store';
import { WorldStore } from '@ui/store/world.store';

/**
 * Canvas host for the 3D world. The hub is created once and never destroyed — a project
 * destination is an overlay rendered into the child outlet (IMPLEMENTATION_PLAN.md §3).
 */
@Component({
  selector: 'app-hub-page',
  imports: [RouterOutlet, Hud],
  template: `
    <canvas
      #canvas
      class="hub-canvas"
      tabindex="0"
      role="application"
      aria-label="3D-Welt: mit WASD bewegen, mit den Pfeiltasten umsehen"
      (click)="input.requestLock()"
    ></canvas>
    <app-hud />
    <router-outlet />
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      block-size: 100dvh;
      overflow: hidden;
      background: #bcd7e8;
    }
    .hub-canvas {
      display: block;
      inline-size: 100%;
      block-size: 100%;
    }
    .hub-canvas:focus-visible {
      outline: 3px solid #fff;
      outline-offset: -3px;
    }
  `,
  host: { '[attr.data-phase]': 'store.phase()' },
})
export class HubPage {
  protected readonly input = inject(InputService);
  protected readonly store = inject(WorldStore);

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly engine = inject(ENGINE);
  private readonly capability = inject(CapabilityService);
  private readonly settings = inject(SettingsStore);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /**
   * The router is the source of truth for which destination is open (§3); everything else follows
   * from this one signal.
   */
  private readonly openSlug = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      startWith(null),
      map(() => this.route.snapshot.firstChild?.paramMap.get('slug') ?? null),
    ),
    { initialValue: null },
  );

  constructor() {
    effect(() => {
      this.input.sensitivity = this.settings.sensitivity();
    });
    effect(() => this.capability.override(this.settings.qualityOverride()));

    effect(() => {
      const slug = this.openSlug();
      this.store.openProject(slug);
      this.input.setMode(slug ? 'ui' : 'world');
      // Keep the hub alive but cheap behind the panel; on the weakest tier stop drawing entirely.
      this.engine.setThrottle(slug && this.capability.tier() !== 'low' ? 15 : null);
      // The store owns why the app pauses; the engine adds its own reasons (tab hidden, off-screen).
      this.engine.setPaused(
        this.store.paused() || (slug !== null && this.capability.tier() === 'low'),
      );
    });

    afterNextRender(() => this.boot());
    inject(DestroyRef).onDestroy(() => this.engine.detach());
  }

  private boot(): void {
    const canvas = this.canvas().nativeElement;

    try {
      this.store.beginLoading(1, 'Welt');
      this.engine.attach(canvas);
      this.engine.resize(canvas.clientWidth, canvas.clientHeight);

      const hub = new HubScene({ reducedMotion: this.capability.reducedMotion });
      this.engine.setScene(hub);
      this.engine.player.teleport(hub.spawn.clone().setY(hub.ground.heightAt(0, 0)));

      this.store.reportProgress(1);
      this.store.markReady();
      this.store.setArea('Lichtung');
    } catch (error) {
      this.store.fail(error instanceof Error ? error.message : String(error));
    }
  }
}
