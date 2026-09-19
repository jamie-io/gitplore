import { TestBed } from '@angular/core/testing';
import { CapabilityService, DEVICE_CAPABILITIES } from '@engine/capability.service';
import { App } from './app';
import { appConfig } from './app.config';

describe('App', () => {
  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem(
      'gitplore.settings',
      JSON.stringify({ qualityOverride: 'low', sensitivity: 1, reducedMotionOverride: true }),
    );
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [
        ...appConfig.providers,
        {
          provide: DEVICE_CAPABILITIES,
          useValue: {
            webgl2: true,
            rendererDescription: 'Apple M2',
            hardwareConcurrency: 10,
            devicePixelRatio: 2,
            reducedMotion: false,
            coarsePointer: false,
          },
        },
      ],
    }).compileComponents();
  });

  it('creates the application shell', () => {
    expect(TestBed.createComponent(App).componentInstance).toBeTruthy();
  });

  it('applies persisted settings at startup, without the settings dialog', () => {
    TestBed.createComponent(App);
    const capability = TestBed.inject(CapabilityService);

    // The device would be detected as high tier with system motion enabled.
    expect(capability.detectedTier()).toBe('high');
    expect(capability.tier()).toBe('low');
    expect(capability.reducedMotion()).toBe(true);
  });
});
