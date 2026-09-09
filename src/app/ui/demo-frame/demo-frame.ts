import {
  Component,
  DestroyRef,
  InjectionToken,
  afterNextRender,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';

/** How long the iframe may take to load before the screenshot card takes over (§5). */
export const DEMO_LOAD_TIMEOUT_MS = new InjectionToken<number>('DEMO_LOAD_TIMEOUT_MS', {
  providedIn: 'root',
  factory: () => 8000,
});

/**
 * An existing web app shown inside the panel (IMPLEMENTATION_PLAN.md §5). The iframe appears only
 * when the demo is known to be frameable; the screenshot with an external link is the fallback
 * for everything else, including a frame that never finishes loading.
 */
@Component({
  selector: 'app-demo-frame',
  template: `
    @if (framed()) {
      <iframe
        class="frame"
        [src]="safeUrl()"
        [title]="'Demo: ' + title()"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        loading="lazy"
        referrerpolicy="no-referrer"
        (load)="loaded.set(true)"
      ></iframe>
    } @else {
      <figure class="card">
        <img [src]="screenshot()" [alt]="'Screenshot: ' + title()" />
        @if (timedOut()) {
          <figcaption role="status">
            Die Demo lässt sich hier nicht laden – bitte in neuem Tab öffnen.
          </figcaption>
        }
      </figure>
    }
    <a data-role="open-tab" [href]="url()" target="_blank" rel="noopener noreferrer">
      In neuem Tab öffnen
    </a>
  `,
  styles: `
    :host {
      display: grid;
      gap: 0.6rem;
    }
    .frame {
      inline-size: 100%;
      aspect-ratio: 16 / 10;
      border: 1px solid rgb(0 0 0 / 15%);
      border-radius: 0.5rem;
      background: #fff;
    }
    .card {
      margin: 0;
    }
    .card img {
      inline-size: 100%;
      border-radius: 0.5rem;
    }
    figcaption {
      margin-block-start: 0.4rem;
      font-size: 0.9rem;
    }
    a {
      justify-self: start;
      padding: 0.5rem 1rem;
      border-radius: 0.5rem;
      background: var(--primary, #333);
      color: #fff;
      text-decoration: none;
    }
  `,
})
export class DemoFrame {
  readonly url = input.required<string>();
  readonly title = input.required<string>();
  readonly embeddable = input.required<boolean>();
  readonly screenshot = input.required<string>();

  protected readonly loaded = signal(false);
  protected readonly timedOut = signal(false);

  private readonly sanitizer = inject(DomSanitizer);
  private readonly timeoutMs = inject(DEMO_LOAD_TIMEOUT_MS);

  /** Only https ever reaches the iframe; the panel's link still shows whatever the data says. */
  protected readonly framed = computed(
    () => this.embeddable() && !this.timedOut() && this.url().startsWith('https://'),
  );

  protected readonly safeUrl = computed(() =>
    this.sanitizer.bypassSecurityTrustResourceUrl(this.url()),
  );

  constructor() {
    const destroyRef = inject(DestroyRef);
    afterNextRender(() => {
      const timer = setTimeout(() => {
        if (!this.loaded()) {
          this.timedOut.set(true);
        }
      }, this.timeoutMs);
      destroyRef.onDestroy(() => clearTimeout(timer));
    });
  }
}
