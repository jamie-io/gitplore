import { TestBed } from '@angular/core/testing';
import { CapabilityService } from '@engine/capability.service';
import type { StationPlate } from '@engine/stations/station';
import { HudPlate } from './hud-plate';

const plate: StationPlate = {
  kicker: 'Station 3',
  title: 'Commit-Stufen',
  text: 'Elf Stufen hinauf zum Bogen.',
  en: 'Eleven steps up to the arch.',
};

describe('HudPlate', () => {
  async function render(value: StationPlate | null) {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [HudPlate],
      providers: [{ provide: CapabilityService, useValue: { reducedMotion: () => false } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(HudPlate);
    fixture.componentRef.setInput('plate', value);
    await fixture.whenStable();
    return fixture;
  }

  it('renders kicker, title, German text and English text', async () => {
    const fixture = await render(plate);
    const host = fixture.nativeElement as HTMLElement;

    expect(host.querySelector('[data-role="plate"]')?.textContent).toContain('Station 3');
    expect(host.querySelector('[data-role="plate"] h2')?.textContent).toContain('Commit-Stufen');
    expect(host.querySelector('[data-role="plate"] .text')?.textContent).toContain(
      'Elf Stufen hinauf zum Bogen.',
    );
    expect(host.querySelector('[data-role="plate"] .en')?.textContent).toContain(
      'Eleven steps up to the arch.',
    );
  });

  it('renders nothing without a plate', async () => {
    const fixture = await render(null);

    expect(fixture.nativeElement.querySelector('[data-role="plate"]')).toBeNull();
  });
});
