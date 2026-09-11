import { LandmarkShape } from '../landmarks/base/landmark';
import { PortalLandmark } from '../landmarks/base/portal.landmark';

/**
 * The way out of a repo world: the same arch as the one the visitor walked into, with the prompt
 * and the destination reversed. It is an ordinary `Landmark`, so it blocks, it glides the camera
 * and it honours `prefers-reduced-motion` without a line of its own (spec §5).
 */
export class ReturnPortal extends PortalLandmark {
  protected override describe(): LandmarkShape {
    const portal = super.describe();

    return {
      colliders: portal.colliders,
      // The exhibit in the same scene is built from the same project and would otherwise carry the
      // identical interactable id, which is what `InteractionSystem` tells nearby things apart by.
      interactables: portal.interactables.map((interactable) => ({
        ...interactable,
        id: `${this.id}:return`,
        prompt: 'Zurück zur Lichtung',
      })),
    };
  }
}
