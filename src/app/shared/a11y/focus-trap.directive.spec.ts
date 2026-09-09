import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FocusTrapDirective } from './focus-trap.directive';

@Component({
  imports: [FocusTrapDirective],
  template: `
    <button id="outside" type="button">outside</button>
    @if (open()) {
      <div appFocusTrap>
        <button id="first" type="button">first</button>
        <a id="middle" href="https://example.com">middle</a>
        <button id="last" type="button">last</button>
      </div>
    }
  `,
})
class Host {
  readonly open = signal(false);
}

describe('FocusTrapDirective', () => {
  let fixture: ReturnType<typeof TestBed.createComponent<Host>>;

  const byId = (id: string) => document.getElementById(id) as HTMLElement;
  const tab = (shift = false) => {
    const event = new KeyboardEvent('keydown', {
      key: 'Tab',
      shiftKey: shift,
      bubbles: true,
      cancelable: true,
    });
    (document.activeElement ?? document.body).dispatchEvent(event);
    return event;
  };

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
    fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();

    // Focus must already be outside when the trap appears, so it has somewhere to hand focus back to.
    byId('outside').focus();
    fixture.componentInstance.open.set(true);
    await fixture.whenStable();
  });

  afterEach(() => fixture.nativeElement.remove());

  it('moves focus into the trapped region', () => {
    expect(document.activeElement?.id).toBe('first');
  });

  it('wraps from the last element back to the first', () => {
    byId('last').focus();

    const event = tab();

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('first');
  });

  it('wraps backwards from the first element to the last', () => {
    byId('first').focus();

    const event = tab(true);

    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement?.id).toBe('last');
  });

  it('leaves tabbing between inner elements alone', () => {
    byId('first').focus();

    expect(tab().defaultPrevented).toBe(false);
  });

  it('gives focus back to where it was when the trap goes away', async () => {
    fixture.componentInstance.open.set(false);
    await fixture.whenStable();

    expect(document.activeElement?.id).toBe('outside');
  });

  describe('with an embedded frame', () => {
    @Component({
      imports: [FocusTrapDirective],
      template: `
        <div appFocusTrap>
          <button id="f-first" type="button">first</button>
          <iframe id="f-frame" title="demo"></iframe>
        </div>
      `,
    })
    class FrameHost {}

    it('treats an iframe as the last tab stop, so tabbing wraps instead of escaping', async () => {
      TestBed.resetTestingModule();
      await TestBed.configureTestingModule({ imports: [FrameHost] }).compileComponents();
      const frameFixture = TestBed.createComponent(FrameHost);
      document.body.appendChild(frameFixture.nativeElement);
      await frameFixture.whenStable();

      byId('f-frame').focus();
      const event = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
      byId('f-frame').dispatchEvent(event);

      expect(event.defaultPrevented).toBe(true);
      expect(document.activeElement?.id).toBe('f-first');
      frameFixture.nativeElement.remove();
    });
  });
});
