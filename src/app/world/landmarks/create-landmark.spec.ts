import { PROJECTS } from '@content/projects';
import { Project } from '@content/project.model';
import { PortalLandmark } from './base/portal.landmark';
import { ScreenLandmark } from './base/screen.landmark';
import { createLandmark } from './create-landmark';

const base = {
  ground: { heightAt: () => 0 },
  reducedMotion: false,
  onEnter: () => undefined,
  textures: { load: () => new (class {})() as never, release: () => undefined },
};

function withKind(kind: string): Project {
  const project = PROJECTS[0];
  return { ...project, landmark: { ...project.landmark, kind } };
}

describe('createLandmark', () => {
  it('builds a portal for portal landmarks', () => {
    expect(createLandmark({ ...base, project: withKind('portal') })).toBeInstanceOf(PortalLandmark);
  });

  it('builds a screen for screen landmarks', () => {
    expect(createLandmark({ ...base, project: withKind('screen') })).toBeInstanceOf(ScreenLandmark);
  });

  it('falls back to a portal for a kind it does not know yet', () => {
    expect(createLandmark({ ...base, project: withKind('hologram') })).toBeInstanceOf(
      PortalLandmark,
    );
  });
});
