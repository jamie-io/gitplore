import { Service, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AssetService } from '@engine/asset.service';
import { CapabilityService } from '@engine/capability.service';
import { ENGINE } from '@engine/engine.service';
import { PLAYER_EYE_HEIGHT } from '@engine/player/player-controller';
import { WorldScene } from '@engine/world-object';
import { ContentService } from '@content/content.service';
import type { Project } from '@content/project.model';
import { WorldStore } from '@ui/store/world.store';
import { HubScene } from '@world/hub/hub.scene';
import { createEnvironment } from '@world/environments/create-environment';
import type { Environment } from '@world/environments/environment';
import { createProjectScene } from '@world/project/create-project-scene';
import { InWorldDemo, ProjectScene } from '@world/project/project.scene';

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

  private readonly menuDistanceEffect = effect(() => {
    if (this.store.menuOpen()) {
      this.captureMenuDistances();
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
      // `setScene` disposes the previous world; only a scene that reaches here was ever built.
      this.engine.setScene(scene);
      this.current = scene;
      this.place(scene);
      this.store.setArea(project ? `${environment.name} — ${project.title}` : environment.name);
      this.store.setCurrentProject(project?.slug ?? null);
      this.store.setTravelDistances(new Map());
      this.previousSlug = slug;
    } finally {
      if (token === this.sequence) {
        this.store.setSwapping(false);
      }
    }
  }

  /** Starts the current world's in-world demo, if it has one. */
  startDemo(): void {
    const demo = this.current instanceof ProjectScene ? this.current.demo : null;
    if (!demo || this.demo) {
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
      textures: this.assets,
    });
  }

  private captureMenuDistances(): void {
    if (!(this.current instanceof HubScene)) {
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

  /** Where the arriving player stands (spec §6, "Placement and re-entrancy"). */
  private place(scene: WorldScene): void {
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
