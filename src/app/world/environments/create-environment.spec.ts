import { ENVIRONMENT_IDS } from '@content/project.model';
import { createEnvironment } from './create-environment';

describe('createEnvironment', () => {
  it.each(ENVIRONMENT_IDS)('builds the %s environment', async (id) => {
    const environment = await createEnvironment(id, { reducedMotion: () => false });

    expect(environment.id).toBe(id);
  });

  it('falls back to the showroom for an id it does not know', async () => {
    // A stale cached repos.json can name a world this build no longer ships.
    const environment = await createEnvironment('atlantis' as never, {
      reducedMotion: () => false,
    });

    expect(environment.id).toBe('showroom');
  });
});
