import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CapabilityService } from '@engine/capability.service';
import type { StationChip } from '@engine/stations/station';
import { StationBar } from './station-bar';

const chips: readonly StationChip[] = [
  { index: 1, id: 'one', name: 'Laterne', state: 'here' },
  { index: 2, id: 'two', name: 'Feed-Pfad', state: 'visited' },
  { index: 3, id: 'three', name: 'Commit-Stufen', state: 'next' },
  { index: 4, id: 'four', name: 'Bogen', state: 'open' },
];

describe('StationBar', () => {
  async function bar(hidden = false): Promise<ComponentFixture<StationBar>> {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [StationBar],
      providers: [{ provide: CapabilityService, useValue: { reducedMotion: () => false } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(StationBar);
    fixture.componentRef.setInput('chips', chips);
    fixture.componentRef.setInput('hidden', hidden);
    await fixture.whenStable();
    return fixture;
  }

  it('renders each station state with its mark and accessible label', async () => {
    const fixture = await bar();
    const host = fixture.nativeElement as HTMLElement;
    const buttons = host.querySelectorAll<HTMLButtonElement>('[data-role="station-chip"]');

    expect(buttons).toHaveLength(4);
    expect(buttons[0]?.dataset['state']).toBe('here');
    expect(buttons[0]?.querySelector('.mark')?.textContent?.trim()).toBe('1');
    expect(buttons[1]?.dataset['state']).toBe('visited');
    expect(buttons[1]?.querySelector('.mark')?.textContent?.trim()).toBe('✓');
    expect(buttons[2]?.dataset['state']).toBe('next');
    expect(buttons[2]?.querySelector('.mark')?.textContent?.trim()).toBe('3');
    expect(buttons[3]?.dataset['state']).toBe('open');
    expect(buttons[3]?.getAttribute('aria-label')).toBe('Station 4: Bogen');
  });

  it('emits the selected station index', async () => {
    const fixture = await bar();
    const selected: number[] = [];
    fixture.componentInstance.glide.subscribe((index) => selected.push(index));
    const host = fixture.nativeElement as HTMLElement;

    host.querySelectorAll<HTMLButtonElement>('[data-role="station-chip"]')[2]?.click();

    expect(selected).toEqual([3]);
  });

  it('makes hidden chips unavailable to assistive technology and focus', async () => {
    const fixture = await bar(true);
    const host = fixture.nativeElement as HTMLElement;
    const chip = host.querySelector<HTMLButtonElement>('[data-role="station-chip"]');

    expect(host.getAttribute('aria-hidden')).toBe('true');
    expect(host.hasAttribute('inert')).toBe(true);
    expect(chip ? getComputedStyle(chip).pointerEvents : null).toBe('none');
  });
});
