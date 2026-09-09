import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DemoPanelHost } from './demo-panel-host';

@Component({ template: '<p data-role="stub-demo">Hallo Demo</p>' })
class StubDemo {}

describe('DemoPanelHost', () => {
  let fixture: ComponentFixture<DemoPanelHost>;

  const host = () => fixture.nativeElement as HTMLElement;
  const settle = async () => {
    await fixture.whenStable();
    await Promise.resolve();
    await fixture.whenStable();
  };

  beforeEach(async () => {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [DemoPanelHost] }).compileComponents();
    fixture = TestBed.createComponent(DemoPanelHost);
  });

  it('shows a loading note until the component has arrived', () => {
    fixture.componentRef.setInput('load', () => new Promise<never>(() => undefined));
    // Not `whenStable`: a pending resource would keep the fixture unstable forever.
    TestBed.tick();

    expect(host().querySelector('[role="status"]')).not.toBeNull();
  });

  it('renders the lazily loaded demo component', async () => {
    fixture.componentRef.setInput('load', () => Promise.resolve(StubDemo));
    await settle();

    expect(host().querySelector('[data-role="stub-demo"]')?.textContent).toContain('Hallo Demo');
  });

  it('says so when the demo cannot be loaded', async () => {
    fixture.componentRef.setInput('load', () => Promise.reject(new Error('chunk failed')));
    await settle();

    expect(host().querySelector('[role="alert"]')).not.toBeNull();
  });
});
