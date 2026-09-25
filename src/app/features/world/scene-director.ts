import { Service, effect, inject, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { Vector3 } from 'three';
import { AssetService } from '@engine/asset.service';
import { AudioService } from '@engine/audio/audio.service';
import { MOMENT, arrivalShot, momentShot } from '@engine/camera/camera-shot';
import { CapabilityService } from '@engine/capability.service';
import { ENGINE } from '@engine/engine.service';
import { InputService } from '@engine/input.service';
import { PLAYER_EYE_HEIGHT } from '@engine/player/player-controller';
import { planGlide } from '@engine/stations/glide';
import { Tickable, WorldScene } from '@engine/world-object';
import { ContentService } from '@content/content.service';
import type { Project } from '@content/project.model';
import { WorldStore } from '@ui/store/world.store';
import { HubScene } from '@world/hub/hub.scene';
import { createEnvironment } from '@world/environments/create-environment';
import type { Environment } from '@world/environments/environment';
import { createProjectScene } from '@world/project/create-project-scene';
import { InWorldDemo, ProjectScene } from '@world/project/project.scene';
import { StationDirector } from './station-director';

/** How long a toast stays up after the last one was shown. */
const TOAST_MS = 2200;

/** The session key that remembers a world's arrival camera has played. */
const arrivalKey = (sceneId: string) => `gitplore.arrival.${sceneId}`;

/**
 * Turns the open route into the world on screen (spec §6).
 *
 * It lives in `features/` because it is the one thing that legitimately needs both a scene and the
 * router; `@ui/*` may not import `@world/*`, and `@world/*` may not know about routing.
 */
@Service()
export class SceneDirector {
  private readonly engine = inject(ENGINE);
  private readonly content = inject(ContentService);
  private readonly capability = inject(CapabilityService);
  private readonly assets = inject(AssetService);
  private readonly audio = inject(AudioService);
  private readonly input = inject(InputService);
  private readonly store = inject(WorldStore);
  private readonly router = inject(Router);

  /**
   * Guards re-entrancy: a second navigation while a build is in flight bumps this, and the first
   * build then throws its result away instead of swapping a world nobody asked for any more.
   */
  private sequence = 0;
  private current: WorldScene | null = null;
  /** The project the visitor last stood in, so returning puts them back at its portal. */
  private previousSlug: string | null = null;
  private demo: InWorldDemo | null = null;

  /** Tracks the current world's stations; `null` in a world without any. */
  private stations: StationDirector | null = null;
  /** A world placed before the visitor clicked through the start gate, whose arrival is owed. */
  private pendingArrival: WorldScene | null = null;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private bannerTimer: ReturnType<typeof setTimeout> | null = null;

  /** Rides the render loop: the station bar and the plate follow the player, written on change. */
  private readonly stationTicker: Tickable = { update: () => this.updateStations() };

  /**
   * The HUD makes way for a shot, so the store mirrors the engine's. A shot's end also ends the
   * banner raised over it, however the shot ended: run out, skipped or cut short.
   */
  private readonly offShotChange = this.engine.onShotChange((kind) => {
    this.store.shot.set(kind);
    if (kind === null) {
      this.store.banner.set(null);
    }
  });

  /**
   * Behind the start gate the world is already running, and an arrival played there would be over
   * before anyone saw it; it waits for the click instead.
   */
  private readonly arrivalEffect = effect(() => {
    if (this.store.started()) {
      untracked(() => this.flushArrival());
    }
  });

  private readonly menuDistanceEffect = effect(() => {
    const menuOpen = this.store.menuOpen();
    const currentProject = this.store.currentProject();
    if (menuOpen) {
      this.captureMenuDistances(currentProject);
    }
  });

  /** Builds the world the route asks for. `null` is the start world. */
  async show(slug: string | null): Promise<void> {
    const token = ++this.sequence;
    // Raised synchronously, before the first `await`: a caller that does not await `show()`
    // (the router guard, the panel's "back to the hub" handler) must see the flag flip at once.
    this.store.setSwapping(true);

    try {
      // A visitor can open `/p/:slug` before the portfolio has finished loading — that deep link
      // is the primary entry path, not an edge case — so `bySlug` must not run until content is
      // ready. Without this, an early call sees an empty project list and treats a real slug as
      // unknown, building nothing at all.
      await this.content.ready;
      if (token !== this.sequence) {
        return;
      }

      const project = slug === null ? null : (this.content.bySlug(slug) ?? null);
      // An unknown slug builds nothing new: whatever world is already standing stays, and the
      // panel explains itself on top of it (spec §6). A cold boot straight into an unknown slug
      // has nothing standing yet, though — there `this.current` is still `null`, so this falls
      // through and builds the start world instead, exactly as a `null` slug would.
      if (slug !== null && !project && this.current) {
        return;
      }

      const environment = await createEnvironment(project?.environment ?? 'clearing', {
        reducedMotion: () => this.capability.reducedMotion(),
      });
      // Superseded while the chunk loaded. Nothing has been handed to the engine and nothing has
      // been `init`ed, so the half-built environment holds no GPU resources to release.
      if (token !== this.sequence) {
        return;
      }

      const scene = project
        ? await this.projectScene(project, environment)
        : this.hubScene(environment);
      if (token !== this.sequence) {
        return;
      }

      this.endDemo();
      // Cleared before the swap: the incoming world writes its own state when it starts.
      this.store.setWorldStatus(null);
      this.clearStations();
      // `setScene` disposes the previous world; only a scene that reaches here was ever built.
      this.engine.setScene(scene);
      // After the scene, so the interaction reset it fires has already cleared what was nearby.
      // The sound of a place travels with its light: both are cut from the environment's mood.
      this.audio.setWorld(environment.mood.audio);
      this.current = scene;
      this.place(scene);
      this.store.setArea(project ? `${environment.name} — ${project.title}` : environment.name);
      this.store.setEnvironment(environment.id);
      this.store.setCurrentProject(project?.slug ?? null);
      this.store.setTravelDistances(new Map());
      this.previousSlug = slug;
    } finally {
      if (token === this.sequence) {
        this.store.setSwapping(false);
      }
    }
  }

  /**
   * Starts the current world's in-world demo, if it has one. A world-mode demo only sets the world
   * up and leaves the visitor walking: nothing is captured, and E still reaches the world.
   */
  startDemo(): void {
    const demo = this.current instanceof ProjectScene ? this.current.demo : null;
    if (!demo || this.demo) {
      return;
    }
    if (demo.mode === 'world') {
      demo.enter(this.engine.player);
      return;
    }

    this.demo = demo;
    demo.enter(this.engine.player);
    this.store.setDemoActive(true, demo.demoHint);
  }

  endDemo(): void {
    if (!this.demo) {
      return;
    }
    this.demo.exit();
    this.demo = null;
    this.store.setDemoActive(false);
  }

  /** Lets a running demo consume the interact key. `false` means the world should handle it. */
  demoInteract(): boolean {
    if (!this.demo) {
      return false;
    }
    this.demo.interact();

    return true;
  }

  /**
   * Restarts current world's local flow, if it exposes one. The stations start over with it: no
   * shot, no glide, nothing visited. The arrival does not play again.
   */
  restart(): void {
    this.clearStations();
    this.current?.restart?.(this.engine.player);
  }

  /**
   * Glides the player to station `index` (1…8), or to the portal for 0, along the world's own
   * path. Does nothing in a world without stations or for a station it does not have.
   */
  glideTo(index: number): void {
    // Any station key skips a running shot, whether or not there is anywhere to glide to.
    this.engine.skipShot();
    const scene = this.current;
    if (!scene?.stations) {
      return;
    }
    const stand = index === 0 ? scene.portalStand : scene.stations[index - 1]?.stand;
    if (!stand) {
      return;
    }

    const from = { x: this.engine.player.position.x, z: this.engine.player.position.z };
    const to = { x: stand.x, z: stand.z };
    const glide = planGlide(scene.glidePath?.(from, to) ?? [from, to], stand.yaw);
    // `null` means the player already stands there.
    if (glide) {
      this.engine.glide(glide);
    }
  }

  /**
   * The world's key moment (spec §3): the camera rises to the overview and back while `banner`
   * shows. The banner goes when the shot ends; a world without an overview holds it up for the
   * moment's length instead.
   */
  playMoment(banner: string): void {
    this.clearTimer('bannerTimer');
    this.store.banner.set(banner);
    const overview = this.current?.overview;
    if (overview) {
      this.engine.playShot(momentShot(overview, this.capability.reducedMotion()));
      return;
    }
    this.bannerTimer = setTimeout(() => {
      this.bannerTimer = null;
      this.store.banner.set(null);
    }, MOMENT.total * 1000);
  }

  /** Shows a passing line of the world's for 2.2 s after the last one. */
  showToast(text: string): void {
    this.clearTimer('toastTimer');
    this.store.showToast(text);
    this.toastTimer = setTimeout(() => {
      this.toastTimer = null;
      this.store.toast.set(null);
    }, TOAST_MS);
  }

  /** Places a browser test visitor on a spot the world names, or in front of an interactable. */
  teleportToInteractableForTest(id: string): boolean {
    const spot = this.current?.testSpots?.[id];
    if (spot) {
      this.engine.player.teleport(
        new Vector3(spot.x, spot.y + PLAYER_EYE_HEIGHT, spot.z),
        spot.yaw,
      );
      return true;
    }

    const target = this.current?.interactables.find((interactable) => interactable.id === id);
    if (!target) {
      return false;
    }

    this.engine.player.teleport(
      new Vector3(
        target.position.x,
        target.position.y + PLAYER_EYE_HEIGHT,
        target.position.z + 1.5,
      ),
      0,
    );
    return true;
  }

  /**
   * The project menu's direct travel (spec §7). Inside the start world it is a teleport to that
   * project's portal; from a repo world there is nothing to teleport to, so it becomes a
   * navigation and the router builds the world. Selecting the current project opens its panel.
   */
  travelTo(slug: string): void {
    if (this.store.currentProject() === slug) {
      void this.router.navigate(['/p', slug, 'info']);
      return;
    }

    const landmark = this.current instanceof HubScene ? this.current.landmarkFor(slug) : undefined;
    if (!landmark) {
      void this.router.navigate(['/p', slug]);
      return;
    }

    this.endDemo();
    this.engine.player.teleport(
      landmark.spawn.clone().setY(landmark.spawn.y + PLAYER_EYE_HEIGHT),
      landmark.rotationY,
    );
  }

  /** Page teardown: the store is a root singleton, so the remembered state has to go with it. */
  reset(): void {
    this.endDemo();
    this.clearStations();
    this.stations = null;
    this.store.stations.set([]);
    this.engine.removeTickable(this.stationTicker);
    this.sequence++;
    this.current = null;
    this.previousSlug = null;
    this.store.setCurrentProject(null);
    this.store.setTravelDistances(new Map());
    // A build abandoned by the bump above never reaches the `finally` that would otherwise clear
    // this, since its token no longer matches — so it has to be cleared here too.
    this.store.setSwapping(false);
  }

  private hubScene(environment: Environment): HubScene {
    return new HubScene({
      environment,
      reducedMotion: () => this.capability.reducedMotion(),
      projects: this.content.projects(),
      onEnter: (project) => void this.router.navigate(['/p', project.slug]),
      onAreaChange: (area) => this.store.setArea(area),
      onContact: () => void this.router.navigate(['/kontakt']),
      textures: this.assets,
    });
  }

  private projectScene(project: Project, environment: Environment): Promise<ProjectScene> {
    return createProjectScene({
      environment,
      project,
      reducedMotion: () => this.capability.reducedMotion(),
      onOpenInfo: () => void this.router.navigate(['/p', project.slug, 'info']),
      onLeave: () => void this.router.navigate(['/']),
      onDemo: () => this.startDemo(),
      onStatus: (status) => this.store.setWorldStatus(status),
      onToast: (text) => this.showToast(text),
      onMoment: (banner) => this.playMoment(banner),
      input: this.input,
      textures: this.assets,
    });
  }

  private captureMenuDistances(currentProject: string | null): void {
    if (currentProject !== null || !(this.current instanceof HubScene)) {
      this.store.setTravelDistances(new Map());
      return;
    }

    const { x, z } = this.engine.player.position;
    const distances = new Map<string, number>();
    for (const landmark of this.current.landmarks) {
      distances.set(
        landmark.project.slug,
        Math.hypot(landmark.position.x - x, landmark.position.z - z),
      );
    }
    this.store.setTravelDistances(distances);
  }

  /**
   * Sets the arriving player down, then the world's stations and, on a first visit, its arrival
   * camera. After `setScene`, which would end a shot played any earlier.
   */
  private place(scene: WorldScene): void {
    this.placePlayer(scene);

    this.stations = scene.stations
      ? new StationDirector(scene.stations, scene.plateAt?.bind(scene))
      : null;
    this.store.stations.set(this.stations?.chips() ?? []);
    this.store.plate.set(null);
    // Idempotent, and needed again after a page teardown, which empties the engine's tickables.
    this.engine.addTickable(this.stationTicker);

    if (scene.overview) {
      this.pendingArrival = scene;
      this.flushArrival();
    }
  }

  /** Plays the arrival owed to the current world, once the visitor is past the start gate. */
  private flushArrival(): void {
    const scene = this.pendingArrival;
    if (!scene?.overview || !this.store.started()) {
      return;
    }
    this.pendingArrival = null;
    if (!firstVisit(scene.id)) {
      return;
    }
    this.engine.playShot(arrivalShot(scene.overview, this.capability.reducedMotion()));
    this.store.pitch.set(scene.pitch ?? null);
  }

  /**
   * Skipped while a glide runs, so the stations it passes on the way are neither visited nor
   * shown. The engine runs its tickables after it moves the player, so the frame a glide arrives
   * or is cancelled already reads `gliding()` false and takes up the stop the player stands at; a
   * reduced-motion glide never runs at all, and the next frame does the same.
   */
  private updateStations(): void {
    const stations = this.stations;
    if (!stations || this.engine.gliding()) {
      return;
    }
    const { x, z } = this.engine.player.position;
    if (stations.update(x, z)) {
      this.store.stations.set(stations.chips());
      this.store.plate.set(stations.plate());
    }
  }

  /**
   * Everything that belongs to the moment rather than to the world: the shot, the glide, the
   * visits, the plate, a toast, the banner and the pitch. For a swap, a restart and a teardown.
   */
  private clearStations(): void {
    this.engine.endShot();
    this.engine.cancelGlide();
    this.pendingArrival = null;
    this.stations?.reset();
    if (this.stations) {
      this.store.stations.set(this.stations.chips());
    }
    this.clearTimer('toastTimer');
    this.clearTimer('bannerTimer');
    this.store.plate.set(null);
    this.store.toast.set(null);
    this.store.banner.set(null);
    this.store.pitch.set(null);
  }

  private clearTimer(which: 'toastTimer' | 'bannerTimer'): void {
    const timer = this[which];
    if (timer !== null) {
      clearTimeout(timer);
      this[which] = null;
    }
  }

  /** Where the arriving player stands (spec §6, "Placement and re-entrancy"). */
  private placePlayer(scene: WorldScene): void {
    if (scene instanceof ProjectScene) {
      const { position, yaw } = scene.arrival;
      this.engine.player.teleport(position.clone().setY(position.y + PLAYER_EYE_HEIGHT), yaw);
      return;
    }

    const hub = scene as HubScene;
    const landmark = this.previousSlug ? hub.landmarkFor(this.previousSlug) : undefined;
    if (landmark) {
      // In front of the portal they came out of, with their back to it — as it already worked.
      this.engine.player.teleport(
        landmark.spawn.clone().setY(landmark.spawn.y + PLAYER_EYE_HEIGHT),
        landmark.spawnYaw,
      );
      return;
    }
    this.engine.player.teleport(
      hub.spawn.clone().setY(hub.spawn.y + PLAYER_EYE_HEIGHT),
      hub.spawnYaw,
    );
  }
}

/**
 * Whether this is the first visit to `sceneId` in this browser session, marking it as seen. Storage
 * that throws — disabled, full, sandboxed — counts as a first visit: better an arrival twice than
 * never.
 */
function firstVisit(sceneId: string): boolean {
  const key = arrivalKey(sceneId);
  try {
    if (sessionStorage.getItem(key) !== null) {
      return false;
    }
  } catch {
    return true;
  }
  try {
    sessionStorage.setItem(key, '1');
  } catch {
    // Not remembered, so the next visit plays it again.
  }
  return true;
}
