import { NgComponentOutlet } from '@angular/common';
import { Component, Type, computed, input, resource } from '@angular/core';

/**
 * Renders a custom demo that lives inside the panel (IMPLEMENTATION_PLAN.md §5,
 * `demo.mode: 'panel'`). The component is loaded lazily, so it costs nothing until opened.
 */
@Component({
  selector: 'app-demo-panel-host',
  imports: [NgComponentOutlet],
  template: `
    @if (component(); as component) {
      <ng-container *ngComponentOutlet="component" />
    } @else if (demo.error()) {
      <p role="alert">Die Demo konnte nicht geladen werden.</p>
    } @else {
      <p role="status">Demo wird geladen …</p>
    }
  `,
})
export class DemoPanelHost {
  readonly load = input.required<() => Promise<Type<unknown>>>();

  protected readonly demo = resource({
    params: () => this.load(),
    loader: ({ params }) => params(),
  });

  protected readonly component = computed(() => (this.demo.hasValue() ? this.demo.value() : null));
}
