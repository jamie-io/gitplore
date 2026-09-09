import { Landmark, LandmarkOptions } from './base/landmark';
import { PortalLandmark } from './base/portal.landmark';
import { ScreenLandmark } from './base/screen.landmark';
import { DeslopifyLandmark } from './deslopify/deslopify.landmark';

/**
 * Maps `project.landmark.kind` to a landmark class. Curated projects may register bespoke kinds
 * here; anything unknown gets the generic portal, so a typo never leaves a project unreachable.
 */
export function createLandmark(options: LandmarkOptions): Landmark {
  switch (options.project.landmark.kind) {
    case 'screen':
      return new ScreenLandmark(options);
    case 'deslopify':
      return new DeslopifyLandmark(options);
    default:
      return new PortalLandmark(options);
  }
}
