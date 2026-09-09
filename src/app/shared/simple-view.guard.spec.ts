import {
  ActivatedRouteSnapshot,
  RedirectCommand,
  Router,
  RouterStateSnapshot,
  provideRouter,
} from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { DEVICE_PROBE, DeviceProbe } from './device.service';
import { simpleViewGuard } from './simple-view.guard';

const DESKTOP: DeviceProbe = {
  coarsePointer: () => false,
  hasWebgl2: () => true,
  viewportWidth: () => 1440,
};

function runGuard(url: string, probe: Partial<DeviceProbe>) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: DEVICE_PROBE, useValue: { ...DESKTOP, ...probe } }],
  });

  const router = TestBed.inject(Router);
  const tree = router.parseUrl(url);
  const route = new ActivatedRouteSnapshot();
  route.queryParams = tree.queryParams;
  const state = { url } as RouterStateSnapshot;

  return TestBed.runInInjectionContext(() => simpleViewGuard(route, state));
}

function redirectTarget(result: unknown): string {
  expect(result).toBeInstanceOf(RedirectCommand);
  return (result as RedirectCommand).redirectTo.toString();
}

describe('simpleViewGuard', () => {
  beforeEach(() => localStorage.clear());

  it('activates the hub on a capable desktop', () => {
    expect(runGuard('/', {})).toBe(true);
  });

  it('redirects the hub to the project list when the simple view applies', () => {
    expect(redirectTarget(runGuard('/', { hasWebgl2: () => false }))).toBe('/projects');
  });

  it('redirects a project deep link to the matching detail page', () => {
    expect(redirectTarget(runGuard('/p/gitplore', { hasWebgl2: () => false }))).toBe(
      '/projects/gitplore',
    );
  });

  it('honours ?force3d=1 and lets the hub activate on a phone', () => {
    expect(runGuard('/p/gitplore?force3d=1', { coarsePointer: () => true })).toBe(true);
  });
});
