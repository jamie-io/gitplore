import {
  Component,
  DestroyRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  signal,
  viewChild,
  ElementRef,
} from '@angular/core';
import { ActivatedRoute, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map, startWith } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AssetManifest, AssetService } from '@engine/asset.service';
import { AudioService } from '@engine/audio/audio.service';
import { CapabilityService } from '@engine/capability.service';
import { ENGINE } from '@engine/engine.service';
import { InputAction, InputService } from '@engine/input.service';
import { ContentService } from '@content/content.service';
import { Hud } from '@ui/hud/hud';
import { LoadingScreen } from '@ui/loading-screen/loading-screen';
import { ProjectMenu } from '@ui/project-menu/project-menu';
import { SceneVeil } from '@ui/scene-veil/scene-veil';
import { SettingsDialog } from '@ui/settings-dialog/settings-dialog';
import { SettingsStore } from '@ui/store/settings.store';
import { WorldStore } from '@ui/store/world.store';
import { SceneDirector } from './scene-director';

/**
 * Canvas host for the 3D world. The canvas itself is created once and never destroyed; the world
 * rendered into it is swapped by the `SceneDirector` whenever the route names a different project
 * (spec §6), and `/p/:slug/info` renders the project's description panel into the child outlet.
 */
@Component({
  selector: 'app-world-page',
  imports: [RouterOutlet, Hud, ProjectMenu, SettingsDialog, LoadingScreen, SceneVeil],
  template: `
    <h1 class="sr-only">Gitplore – 3D-Welt</h1>
    <canvas
      #canvas
      class="hub-canvas"
      tabindex="0"
      role="application"
      aria-label="3D-Welt: mit WASD bewegen, mit den Pfeiltasten umsehen, E benutzt, V wechselt die Ansicht, M öffnet das Menü"
      (click)="input.requestLock()"
      [inert]="overlayOpen()"
    ></canvas>
    <app-hud [inert]="overlayOpen()" />
    <app-scene-veil [visible]="store.swapping()" [instant]="capability.reducedMotion()" />
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
export class WorldPage {
  protected readonly input = inject(InputService);
  protected readonly store = inject(WorldStore);

  private readonly canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private readonly engine = inject(ENGINE);
  protected readonly capability = inject(CapabilityService);
  private readonly content = inject(ContentService);
  private readonly assets = inject(AssetService);
  private readonly audio = inject(AudioService);
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly director = inject(SceneDirector);
  private readonly settings = inject(SettingsStore);

  /** While a dialog owns the input, what lies beneath it must not be reachable by Tab (§6). */
  protected readonly overlayOpen = computed(() => this.store.inputMode() === 'ui');

  private destroyed = false;
  /** The slug the director last showed, or `undefined` before boot has shown anything. */
  private shown: string | null | undefined = undefined;
  /**
   * Flips once `boot()` has attached the engine and shown its first world. Read reactively so the
   * route-driven build effect (below) cannot race `boot()`'s own first call to `director.show()` —
   * inferring this from `store.phase()` let the `'booting'` → `'loading'` transition re-run the
   * effect while `shown` was still unset, calling `show()` a second time on every cold boot, and,
   * on a failed boot, let it build a world for an engine that was never attached.
   */
  private readonly booted = signal(false);

  /**
   * The router is the source of truth for which world is open and whether the panel is on top of
   * it (spec §6); everything else follows from this one signal.
   */
  private readonly routeState = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      startWith(null),
      map(() => {
        const destination = this.route.snapshot.firstChild;
        return {
          slug: destination?.paramMap.get('slug') ?? null,
          panel: destination?.firstChild?.routeConfig?.path === 'info',
        };
      }),
    ),
    { initialValue: { slug: null as string | null, panel: false } },
  );

  constructor() {
    effect(() => this.input.setMode(this.store.inputMode()));
    // `@engine` may not reach into `@ui`, so the chosen view travels the same way the tier does.
    // Reactively, because the settings dialog and the view key both move the same signal mid-play.
    effect(() => this.engine.setViewMode(this.settings.viewMode()));
    // The volume and the mute travel the same way, for the same reason.
    effect(() => {
      this.audio.setVolume(this.settings.volume());
      this.audio.setMuted(this.settings.muted());
    });
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

    effect(() => {
      const { panel } = this.routeState();
      this.store.setPanelOpen(panel);
      // Keep the world alive but cheap behind the panel; on the weakest tier stop drawing entirely.
      this.engine.setThrottle(panel && this.capability.tier() !== 'low' ? 15 : null);
      // The panel is the only place an embedded demo runs, and an iframe can make noise of its
      // own: the world behind it drops to a murmur for as long as it is open.
      this.audio.setDucked(panel);
      this.engine.setPaused(this.store.paused() || (panel && this.capability.tier() === 'low'));
      // Opening the panel ends a running demo; the panel is a different place.
      if (panel) {
        this.director.endDemo();
      }
    });

    // Separate, and keyed on the slug alone: a scene build must not be restarted because the panel
    // opened or the quality tier stepped down.
    effect(() => {
      const { slug } = this.routeState();
      if (this.booted() && this.shown !== slug) {
        this.shown = slug;
        // Unlike the boot path's `await`, nothing downstream awaits this call — so a rejection
        // must be turned into a reported failure here, or it becomes an unhandled rejection that
        // silently leaves the visitor on the old world (as in commit fed20b0).
        this.director.show(slug).catch((error: unknown) => {
          this.store.fail(error instanceof Error ? error.message : String(error));
        });
      }
    });

    // The panel asks for an in-world demo through the store; fulfil it once its world exists.
    effect(() => {
      const slug = this.store.demoRequest();
      if (slug && this.store.ready() && !this.store.panelOpen()) {
        this.store.requestDemo(null);
        this.director.startDemo();
      }
    });

    const offActions = this.input.addActionListener((action) => this.onAction(action));
    afterNextRender(() => void this.boot());
    inject(DestroyRef).onDestroy(() => {
      this.destroyed = true;
      offActions();
      this.director.reset();
      this.store.resetTransient();
      this.audio.dispose();
      this.engine.detach();
    });
  }

  protected travelTo(slug: string): void {
    this.director.travelTo(slug);
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
      this.engine.onNearbyChange = (nearby) => {
        this.store.setNearby(nearby);
        this.audio.setNearby(nearby);
      };
      // Sound follows the player, so it rides the render loop rather than change detection.
      this.engine.addTickable({ update: (dt) => this.audio.frame(dt, this.engine.player) });

      const { slug } = this.routeState();
      this.shown = slug;
      await this.director.show(slug);
      // Only now may the route-driven build effect take over: a failed boot below never reaches
      // this line, so it never claims the scene and never builds one for a never-attached engine.
      this.booted.set(true);

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

  private onAction(action: InputAction): void {
    switch (action) {
      case 'interact': {
        // A running demo eats the key; otherwise it goes to whatever the player is facing.
        if (this.director.demoInteract()) {
          this.audio.interact();
          break;
        }
        const nearby = this.engine.nearby;
        if (nearby) {
          // Before the handler: using a portal builds another world, which retunes the audio.
          this.audio.interact();
          nearby.onInteract();
        }
        break;
      }
      case 'menu':
        // `routeState().panel` rather than `store.panelOpen()`: the store copy trails the router
        // by one change-detection pass, and a key can land inside that gap and open the project
        // menu on top of the just-activated panel — two `aria-modal` dialogs at once. Also not
        // before the start gate: two modal dialogs at once, and no projects loaded yet.
        if (!this.routeState().panel && this.store.started()) {
          this.store.toggleMenu();
        }
        break;
      case 'view':
        // The same signal the settings dialog writes, so the rig, the avatar and the stored
        // preference can never disagree about which view is open.
        this.settings.setViewMode(this.settings.viewMode() === 'first' ? 'third' : 'first');
        break;
      case 'exit':
        if (this.store.menuOpen()) {
          this.store.setMenuOpen(false);
        } else if (this.routeState().panel) {
          void this.router.navigate(['/p', this.routeState().slug]);
        } else if (this.store.demoActive()) {
          this.director.endDemo();
        } else if (this.routeState().slug !== null) {
          void this.router.navigate(['/']);
        }
        break;
    }
  }
}
