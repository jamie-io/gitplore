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
import { InputAction, InputService } from '@engine/input.service';
import { ContentService } from '@content/content.service';
import { HubScene } from '@world/hub/hub.scene';
import { Landmark } from '@world/landmarks/base/landmark';
import { Hud } from '@ui/hud/hud';
import { ProjectMenu } from '@ui/project-menu/project-menu';
import { SettingsStore } from '@ui/store/settings.store';
import { WorldStore } from '@ui/store/world.store';
import { PLAYER_EYE_HEIGHT } from '@engine/player/player-controller';

/**
 * Canvas host for the 3D world. The hub is created once and never destroyed — a project
 * destination is an overlay rendered into the child outlet (IMPLEMENTATION_PLAN.md §3).
 */
@Component({
  selector: 'app-hub-page',
  imports: [RouterOutlet, Hud, ProjectMenu],
  template: `
    <canvas
      #canvas
      class="hub-canvas"
      tabindex="0"
      role="application"
      aria-label="3D-Welt: mit WASD bewegen, mit den Pfeiltasten umsehen, E benutzt, M öffnet das Menü"
      (click)="input.requestLock()"
    ></canvas>
    <app-hud />
    @if (store.menuOpen()) {
      <app-project-menu (travel)="travelTo($event)" />
    }
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
  private readonly content = inject(ContentService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private hub: HubScene | null = null;

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
    effect(() => this.input.setMode(this.store.inputMode()));

    let previousSlug: string | null = null;
    effect(() => {
      const slug = this.openSlug();
      this.store.openProject(slug);
      // Keep the hub alive but cheap behind the panel; on the weakest tier stop drawing entirely.
      this.engine.setThrottle(slug && this.capability.tier() !== 'low' ? 15 : null);
      // The store owns why the app pauses; the engine adds its own reasons (tab hidden, off-screen).
      this.engine.setPaused(
        this.store.paused() || (slug !== null && this.capability.tier() === 'low'),
      );

      // Returning from a destination puts the player in front of its landmark, facing away (§3).
      if (slug === null && previousSlug !== null) {
        this.placeAt(this.hub?.landmarkFor(previousSlug), 'away');
      }
      previousSlug = slug;
    });

    const offActions = this.input.addActionListener((action) => this.onAction(action));
    afterNextRender(() => void this.boot());
    inject(DestroyRef).onDestroy(() => {
      offActions();
      this.engine.detach();
    });
  }

  protected travelTo(slug: string): void {
    this.placeAt(this.hub?.landmarkFor(slug), 'towards');
    this.canvas().nativeElement.focus();
  }

  private async boot(): Promise<void> {
    const canvas = this.canvas().nativeElement;

    try {
      this.store.beginLoading(1, 'Welt');
      await this.content.ready;
      this.engine.attach(canvas);
      this.engine.resize(canvas.clientWidth, canvas.clientHeight);
      this.engine.onNearbyChange = (nearby) => this.store.setNearby(nearby);

      const hub = new HubScene({
        reducedMotion: this.capability.reducedMotion,
        projects: this.content.projects(),
        onEnter: (project) => void this.router.navigate(['/p', project.slug]),
        onAreaChange: (area) => this.store.setArea(area),
      });
      this.hub = hub;
      this.engine.setScene(hub);

      // A deep link starts the visitor at that landmark's exit point rather than the centre.
      const deepLinked = this.openSlug();
      const landmark = deepLinked ? hub.landmarkFor(deepLinked) : undefined;
      if (landmark) {
        this.placeAt(landmark, 'away');
      } else {
        this.engine.player.teleport(hub.spawn.clone().setY(PLAYER_EYE_HEIGHT));
      }

      this.store.reportProgress(1);
      this.store.markReady();
    } catch (error) {
      this.store.fail(error instanceof Error ? error.message : String(error));
    }
  }

  /** Puts the player on a landmark's spawn point, looking away from it or at it. */
  private placeAt(landmark: Landmark | undefined, facing: 'away' | 'towards'): void {
    if (!landmark) {
      return;
    }

    const yaw = facing === 'away' ? landmark.spawnYaw : landmark.rotationY;
    this.engine.player.teleport(
      landmark.spawn.clone().setY(landmark.spawn.y + PLAYER_EYE_HEIGHT),
      yaw,
    );
  }

  private onAction(action: InputAction): void {
    switch (action) {
      case 'interact':
        this.engine.nearby?.onInteract();
        break;
      case 'menu':
        if (this.store.activeSlug() === null) {
          this.store.toggleMenu();
        }
        break;
      case 'exit':
        if (this.store.menuOpen()) {
          this.store.setMenuOpen(false);
        } else if (this.store.activeSlug() !== null) {
          void this.router.navigate(['/']);
        }
        break;
    }
  }
}
