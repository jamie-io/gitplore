import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ReadmeService } from './readme.service';

describe('ReadmeService', () => {
  let readme: ReadmeService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    readme = TestBed.inject(ReadmeService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reads the bundled copy for the slug, relative to the base href', async () => {
    const slug = signal<string | undefined>('novaverta');
    const resource = readme.readme(slug);
    TestBed.tick();
    await Promise.resolve();

    const request = http.expectOne('content/readme/novaverta.md');
    expect(request.request.method).toBe('GET');

    request.flush('# Phönix');
    await TestBed.tick();

    expect(resource.value()).toContain('Phönix');
  });

  it('requests nothing while there is no slug', async () => {
    readme.readme(signal<string | undefined>(undefined));
    TestBed.tick();
    await Promise.resolve();

    http.expectNone(() => true);
  });

  it('follows the slug when it changes', async () => {
    const slug = signal<string | undefined>('novaverta');
    readme.readme(slug);
    TestBed.tick();
    await Promise.resolve();
    http.expectOne('content/readme/novaverta.md').flush('# one');

    slug.set('deslopify');
    TestBed.tick();
    await Promise.resolve();

    http.expectOne('content/readme/deslopify.md').flush('# two');
  });
});
