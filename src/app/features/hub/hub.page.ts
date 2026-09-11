import {
  Component,
  DestroyRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  viewChild,
  ElementRef,
} from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AssetManifest, AssetService } from '@engine/asset.service';
import { CapabilityService } from '@engine/capability.service';
import { ENGINE } from '@engine/engine.service';
import { InputAction, InputService } from '@engine/input.service';
import { ContentService } from '@content/content.service';
import { ClearingEnvironment } from '@world/environments/clearing';
import { HubScene } from '@world/hub/hub.scene';
import { Landmark } from '@world/landmarks/base/landmark';
import { Hud } from '@ui/hud/hud';
import { LoadingScreen } from '@ui/loading-screen/loading-screen';
import { ProjectMenu } from '@ui/project-menu/project-menu';
import { SettingsDialog } from '@ui/settings-dialog/settings-dialog';
import { WorldStore } from '@ui/store/world.store';
import { PLAYER_EYE_HEIGHT } from '@engine/player/player-controller';

/**
 * Canvas host for the 3D world. The hub is created once and never destroyed — a project
 * destination is an overlay rendered into the child outlet (IMPLEMENTATION_PLAN.md §3).
 */
@Component({
  selector: 'app-hub-page',
  imports: [RouterOutlet, Hud, ProjectMenu, SettingsDialog, LoadingScreen],
  template: `
    <h1 class="sr-only">Gitplore – 3D-Welt</h1>
    <canvas
      #canvas
      class="hub-canvas"
      tabindex="0"
      role="application"
      aria-label="3D-Welt: mit WASD bewegen, mit den Pfeiltasten umsehen, E benutzt, M öffnet das Menü"
      (click)="input.requestLock()"
      [inert]="overlayOpen()"
    ></canvas>
    <app-hud [inert]="overlayOpen()" />
    @if (store.menuOpen()) {
      <app-project-menu (travel)="travelTo($event)" />
    }
    @if (store.settingsOpen()) {
      <app-settings-dialog />
    }
    <!-- The gate stays out of the way while a deep-linked project is open (§3). -->
    @if (!store.started() && !store.panelOpen()) {
      <app-loading-screen (start)="startWorld()" />
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
    .sr-only {
      position: absolute;
      inline-size: 1px;
      block-size: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .hub-canvas:focus-visible {
      outline: 3px solid #fff;
      outline-offset: -3px;
    }
  `,
  host: {
    '[attr.data-phase]': 'store.phase()',
    '[attr.data-input-mode]': 'store.inputMode()',
  },
})
export class HubPage {
  protected readonly input = inject(InputService);
  protected readonly store = inject(WorldStore);

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly engine = inject(ENGINE);
  private readonly capability = inject(CapabilityService);
  private readonly content = inject(ContentService);
  private readonly assets = inject(AssetService);
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  /** While a dialog owns the input, what lies beneath it must not be reachable by Tab (§6). */
  protected readonly overlayOpen = computed(() => this.store.inputMode() === 'ui');

  private hub: HubScene | null = null;
  private demo: Landmark | null = null;
  private destroyed = false;

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
    effect(() => this.input.setMode(this.store.inputMode()));
    // Settings and adaptive stepping change the tier at runtime; the renderer follows.
    effect(() => {
      this.capability.tier();
      this.engine.refreshQuality();
    });
    // Focus returns to the world when an overlay closes (§6), so keyboard play carries on. After
    // render, because the closing dialog's focus trap restores focus to its opener on destroy.
    const injector = inject(Injector);
    effect(() => {
      if (this.store.inputMode() !== 'ui' && this.store.started()) {
        afterNextRender(
          () => {
            if (!this.destroyed) {
              this.canvas().nativeElement.focus();
            }
          },
          { injector },
        );
      }
    });

    let previousSlug: string | null = null;
    effect(() => {
      const slug = this.openSlug();
      this.store.openProject(slug);
      // Temporary: until Task 9 derives this from the `info` child route, the panel is open
      // exactly when a destination is. Keeps the start gate honest at every commit.
      this.store.setPanelOpen(slug !== null);
      // Keep the hub alive but cheap behind the panel; on the weakest tier stop drawing entirely.
      this.engine.setThrottle(slug && this.capability.tier() !== 'low' ? 15 : null);
      // The store owns why the app pauses; the engine adds its own reasons (tab hidden, off-screen).
      this.engine.setPaused(
        this.store.paused() || (slug !== null && this.capability.tier() === 'low'),
      );

      // Entering a destination ends a running demo; the panel is a different place.
      if (slug !== null) {
        this.endDemo();
      }
      // Returning from a destination puts the player in front of its landmark, facing away (§3).
      if (slug === null && previousSlug !== null) {
        this.placeAt(this.hub?.landmarkFor(previousSlug), 'away');
      }
      previousSlug = slug;
    });

    // The panel asks for an in-world demo through the store; fulfil it once the world exists.
    effect(() => {
      const slug = this.store.demoRequest();
      if (slug && this.store.ready() && this.store.activeSlug() === null) {
        this.store.requestDemo(null);
        this.startDemo(this.hub?.landmarkFor(slug));
      }
    });

    const offActions = this.input.addActionListener((action) => this.onAction(action));
    afterNextRender(() => void this.boot());
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      offActions();
      this.endDemo();
      this.store.resetTransient();
      this.engine.detach();
    });
  }

  protected travelTo(slug: string): void {
    this.endDemo();
    this.placeAt(this.hub?.landmarkFor(slug), 'towards');
  }

  /** The start gate was used: a user gesture, so pointer lock may be requested now. */
  protected startWorld(): void {
    this.canvas().nativeElement.focus();
    this.input.requestLock();
  }

  private async boot(): Promise<void> {
    const canvas = this.canvas().nativeElement;

    try {
      this.store.beginLoading(1, 'Inhalte');
      await this.content.ready;
      // `content.ready` always settles now (ContentService catches its own load failure), so a
      // failed sync is reported here instead of arriving as a rejection.
      const loadError = this.content.error();
      if (loadError) {
        throw new Error(loadError);
      }
      await this.preloadCoreAssets();
      // The visitor may have left for /projects while the content loaded: never attach to a
      // canvas that is no longer on the page, or the loop and listeners would outlive it.
      if (this.destroyed) {
        return;
      }
      this.engine.attach(canvas);
      this.engine.resize(canvas.clientWidth, canvas.clientHeight);
      this.engine.onNearbyChange = (nearby) => this.store.setNearby(nearby);

      const hub = new HubScene({
        environment: new ClearingEnvironment({
          reducedMotion: () => this.capability.reducedMotion(),
        }),
        reducedMotion: () => this.capability.reducedMotion(),
        projects: this.content.projects(),
        onEnter: (project) => void this.router.navigate(['/p', project.slug]),
        onAreaChange: (area) => this.store.setArea(area),
        textures: this.assets,
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

  /**
   * Fetches the `core` asset group behind the loading screen (§8). A missing or broken manifest
   * only costs the preload: every model has a proxy and loads on demand anyway.
   */
  private async preloadCoreAssets(): Promise<void> {
    let manifest: AssetManifest;
    try {
      manifest = await firstValueFrom(this.http.get<AssetManifest>('assets/manifest.json'));
    } catch {
      return;
    }

    const total = this.assets.urlsOf(manifest, 'core').length;
    this.store.beginLoading(total, 'Modelle');
    const failed = await this.assets.preload(manifest, 'core', (loaded) =>
      this.store.reportProgress(loaded),
    );
    if (failed.length > 0) {
      console.warn('gitplore: assets missing, proxies stay in place', failed);
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

  /** Hands the controls to a landmark's demo (§5); `exit` gives them back. */
  private startDemo(landmark: Landmark | undefined): void {
    if (!landmark?.enter || this.demo) {
      return;
    }

    this.demo = landmark;
    landmark.enter();
    this.store.setDemoActive(true, landmark.demoHint);
  }

  private endDemo(): void {
    if (!this.demo) {
      return;
    }
    this.demo.exit?.();
    this.demo = null;
    this.store.setDemoActive(false);
  }

  private onAction(action: InputAction): void {
    switch (action) {
      case 'interact':
        if (this.demo) {
          this.demo.interact?.();
        } else {
          this.engine.nearby?.onInteract();
        }
        break;
      // `openSlug` rather than `store.activeSlug`: the store copy trails the router by one
      // change-detection pass, and a key can land inside that gap.
      case 'menu':
        // Not before the start gate: two modal dialogs at once, and no projects loaded yet.
        if (this.openSlug() === null && this.store.started()) {
          this.store.toggleMenu();
        }
        break;
      case 'exit':
        if (this.store.menuOpen()) {
          this.store.setMenuOpen(false);
        } else if (this.openSlug() !== null) {
          void this.router.navigate(['/']);
        } else if (this.demo) {
          this.endDemo();
        }
        break;
    }
  }
}
