import { TestBed } from '@angular/core/testing';
import { SceneVeil } from './scene-veil';

describe('SceneVeil', () => {
  async function veil(visible: boolean, instant = false) {
    const fixture = TestBed.createComponent(SceneVeil);
    fixture.componentRef.setInput('visible', visible);
    fixture.componentRef.setInput('instant', instant);
    await fixture.whenStable();
    return fixture;
  }

  it('says that something is loading, politely, without trapping focus', async () => {
    const fixture = await veil(true);
    const status = fixture.nativeElement.querySelector('[role="status"]');

    expect(status?.getAttribute('aria-busy')).toBe('true');
    expect(status?.textContent).toContain('Welt wird geladen');
    // A focus trap here would strand the keyboard for the length of the build (spec §7).
    expect(fixture.nativeElement.querySelector('[aria-modal]')).toBe(null);
  });

  it('reports nothing while no scene is being built', async () => {
    const fixture = await veil(false);

    expect(fixture.nativeElement.querySelector('[aria-busy="true"]')).toBe(null);
  });

  it('cuts rather than fades when motion is unwanted', async () => {
    const fixture = await veil(true, true);

    expect(fixture.nativeElement.classList.contains('instant')).toBe(true);
  });
});
