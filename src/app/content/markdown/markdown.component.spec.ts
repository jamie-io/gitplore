import { TestBed } from '@angular/core/testing';
import { ComponentFixture } from '@angular/core/testing';
import { MarkdownComponent } from './markdown.component';

describe('MarkdownComponent', () => {
  let fixture: ComponentFixture<MarkdownComponent>;

  const render = async (markdown: string) => {
    fixture.componentRef.setInput('markdown', markdown);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [MarkdownComponent] }).compileComponents();
    fixture = TestBed.createComponent(MarkdownComponent);
  });

  it('renders headings', async () => {
    const host = await render('# Phönix Industriedienstleistungen');

    expect(host.querySelector('h2')?.textContent).toContain('Phönix');
  });

  it('renders lists and links', async () => {
    const host = await render('- see [the repo](https://github.com/jamie-io/novaverta)');

    expect(host.querySelector('li a')?.getAttribute('href')).toBe(
      'https://github.com/jamie-io/novaverta',
    );
  });

  it('keeps fenced code blocks', async () => {
    const host = await render('```sh\nnpm run verify\n```');

    expect(host.querySelector('pre code')?.textContent).toContain('npm run verify');
  });

  it('strips script tags', async () => {
    const host = await render('Hello <script>globalThis.pwned = true;</script>');

    expect(host.querySelector('script')).toBeNull();
    expect((globalThis as Record<string, unknown>)['pwned']).toBeUndefined();
  });

  it('strips inline event handlers', async () => {
    const host = await render('<img src="x" onerror="globalThis.pwned = true">');

    expect(host.querySelector('img')?.getAttribute('onerror')).toBeNull();
  });

  it('strips javascript: urls', async () => {
    const host = await render('[click](javascript:alert(1))');

    expect(host.querySelector('a')?.getAttribute('href') ?? '').not.toContain('javascript:');
  });

  it('renders nothing for empty markdown', async () => {
    const host = await render('');

    expect(host.textContent?.trim()).toBe('');
  });
});

describe('MarkdownComponent heading levels', () => {
  let fixture: ComponentFixture<MarkdownComponent>;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [MarkdownComponent] }).compileComponents();
    fixture = TestBed.createComponent(MarkdownComponent);
  });

  const render = async (markdown: string, topLevel?: number) => {
    fixture.componentRef.setInput('markdown', markdown);
    if (topLevel !== undefined) {
      fixture.componentRef.setInput('topLevel', topLevel);
    }
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  };

  it('demotes README headings below the page heading by default', async () => {
    const host = await render('# Title\n\n## Section');

    expect(host.querySelector('h1')).toBeNull();
    expect(host.querySelector('h2')?.textContent).toBe('Title');
    expect(host.querySelector('h3')?.textContent).toBe('Section');
  });

  it('starts at whatever level the host asks for', async () => {
    const host = await render('# Title\n\n## Section', 3);

    expect(host.querySelector('h3')?.textContent).toBe('Title');
    expect(host.querySelector('h4')?.textContent).toBe('Section');
  });

  it('never goes deeper than h6', async () => {
    const host = await render('###### Deep', 3);

    expect(host.querySelector('h6')?.textContent).toBe('Deep');
  });

  it('keeps inline formatting inside demoted headings', async () => {
    const host = await render('# Hello *world*');

    expect(host.querySelector('h2 em')?.textContent).toBe('world');
  });
});
