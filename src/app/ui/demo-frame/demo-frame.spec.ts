import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DEMO_LOAD_TIMEOUT_MS, DemoFrame } from './demo-frame';

describe('DemoFrame', () => {
  let fixture: ComponentFixture<DemoFrame>;

  const host = () => fixture.nativeElement as HTMLElement;
  const create = async (inputs: { embeddable: boolean; url?: string }, timeoutMs = 60_000) => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [DemoFrame],
      providers: [{ provide: DEMO_LOAD_TIMEOUT_MS, useValue: timeoutMs }],
    }).compileComponents();
    fixture = TestBed.createComponent(DemoFrame);
    fixture.componentRef.setInput('url', inputs.url ?? 'https://jamie-io.github.io/novaverta/');
    fixture.componentRef.setInput('title', 'Phönix');
    fixture.componentRef.setInput('embeddable', inputs.embeddable);
    fixture.componentRef.setInput('screenshot', 'assets/screens/novaverta.webp');
    await fixture.whenStable();
  };

  it('embeds an embeddable demo in a sandboxed, lazy, referrer-free iframe', async () => {
    await create({ embeddable: true });

    const frame = host().querySelector('iframe');
    expect(frame?.getAttribute('src')).toBe('https://jamie-io.github.io/novaverta/');
    // No allow-same-origin: the demos share the portfolio's origin, so it would be no sandbox.
    expect(frame?.getAttribute('sandbox')).toBe('allow-scripts allow-forms allow-popups');
    expect(frame?.getAttribute('loading')).toBe('lazy');
    expect(frame?.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(frame?.getAttribute('title')).toContain('Phönix');
  });

  it('always offers to open the demo in a new tab', async () => {
    await create({ embeddable: true });

    const link = host().querySelector<HTMLAnchorElement>('a[data-role="open-tab"]');
    expect(link?.getAttribute('href')).toBe('https://jamie-io.github.io/novaverta/');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toContain('noopener');
  });

  it('shows the screenshot card instead of an iframe when the demo cannot be framed', async () => {
    await create({ embeddable: false });

    expect(host().querySelector('iframe')).toBeNull();
    expect(host().querySelector('img')?.getAttribute('src')).toContain(
      'assets/screens/novaverta.webp',
    );
    expect(host().querySelector('a[data-role="open-tab"]')).not.toBeNull();
  });

  it('falls back to the screenshot card when the iframe never loads', async () => {
    await create({ embeddable: true }, 20);
    expect(host().querySelector('iframe')).not.toBeNull();

    await new Promise((resolve) => setTimeout(resolve, 60));
    await fixture.whenStable();

    expect(host().querySelector('iframe')).toBeNull();
    expect(host().querySelector('img')).not.toBeNull();
    expect(host().querySelector('[role="status"]')?.textContent).toContain('neuem Tab');
  });

  it('keeps the iframe once it has loaded', async () => {
    await create({ embeddable: true }, 20);
    host().querySelector('iframe')?.dispatchEvent(new Event('load'));

    await new Promise((resolve) => setTimeout(resolve, 60));
    await fixture.whenStable();

    expect(host().querySelector('iframe')).not.toBeNull();
  });

  it('refuses to frame anything but https', async () => {
    await create({ embeddable: true, url: 'javascript:alert(1)' });

    expect(host().querySelector('iframe')).toBeNull();
  });
});
