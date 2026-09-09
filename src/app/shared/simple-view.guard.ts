import { CanActivateFn, RedirectCommand, Router } from '@angular/router';
import { inject } from '@angular/core';
import { DeviceService } from './device.service';

const PROJECT_DEEP_LINK = /^\/p\/([^/?#]+)/;

/**
 * Keeps phones and WebGL2-less browsers out of the 3D hub (IMPLEMENTATION_PLAN.md §3, §7).
 *
 * This must stay a `canActivate` guard returning a `RedirectCommand`. As `canMatch` a non-matching
 * `''` would fall through to the `**` route, which redirects to `''` again — an endless loop.
 */
export const simpleViewGuard: CanActivateFn = (route, state) => {
  const device = inject(DeviceService);

  if (route.queryParamMap.get('force3d') === '1') {
    device.rememberForce3d();
  }

  if (!device.simpleView()) {
    return true;
  }

  const slug = PROJECT_DEEP_LINK.exec(state.url)?.[1];
  return new RedirectCommand(inject(Router).parseUrl(slug ? `/projects/${slug}` : '/projects'));
};
