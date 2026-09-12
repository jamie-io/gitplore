import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import { Marked, type Tokens } from 'marked';

/** The deepest heading HTML has. */
const MAX_HEADING_LEVEL = 6;

/** Accessible names for a GFM task list box, in the page's language. */
const TASK_DONE_LABEL = 'Erledigt';
const TASK_OPEN_LABEL = 'Offen';

/**
 * A sanitiser of this module's own rather than the shared default instance: the link policy below
 * is a README rule, and a hook on the singleton would apply to every DOMPurify caller in the app.
 */
const purifier = DOMPurify(window);

/**
 * A README link that leaves the page would otherwise discard the running world. External links
 * open in a new tab; every anchor gets a safe `rel`, whatever the source markdown carried. This
 * runs after sanitising rather than in the renderer, so raw HTML anchors are covered too.
 */
purifier.addHook('afterSanitizeAttributes', (node) => {
  if (!(node instanceof HTMLAnchorElement)) {
    return;
  }
  const href = node.getAttribute('href') ?? '';
  if (/^(https?:)?\/\//i.test(href)) {
    node.setAttribute('target', '_blank');
  }
  if (node.getAttribute('target') === '_blank') {
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

/**
 * A README's `#` becomes a heading of `topLevel`, so the document keeps a single `h1` — the page's
 * own — and the README reads as a section below it.
 */
function markedWithHeadingsFrom(topLevel: number): Marked {
  return new Marked({
    renderer: {
      heading({ tokens, depth }: Tokens.Heading): string {
        const level = Math.min(depth + topLevel - 1, MAX_HEADING_LEVEL);
        return `<h${level}>${this.parser.parseInline(tokens)}</h${level}>\n`;
      },
      checkbox({ checked }: Tokens.Checkbox): string {
        // `marked` emits a bare disabled checkbox, which is a form control without an accessible
        // name. The box carries the only rendering of the task's state, so it is named rather than
        // hidden: axe's `label` rule flagged all eleven of them in Deslopify's README.
        const name = checked ? TASK_DONE_LABEL : TASK_OPEN_LABEL;
        return `<input${checked ? ' checked=""' : ''} disabled="" type="checkbox" aria-label="${name}">`;
      },
    },
  });
}

/**
 * Renders README markdown. `marked` for the parse, DOMPurify for the sanitising, and only then
 * `bypassSecurityTrustHtml` — Angular's own sanitiser would strip too much of a README
 * (IMPLEMENTATION_PLAN.md §4).
 */
@Component({
  selector: 'app-markdown',
  template: `<div class="markdown" [innerHTML]="html()"></div>`,
  styles: `
    .markdown {
      overflow-wrap: anywhere;
    }
    .markdown :where(h2, h3, h4) {
      line-height: 1.25;
    }
    .markdown :where(pre) {
      overflow-x: auto;
      padding: 0.75rem;
      border-radius: 0.5rem;
      background: rgb(0 0 0 / 6%);
    }
    .markdown :where(img) {
      max-inline-size: 100%;
      height: auto;
    }
    .markdown :where(table) {
      display: block;
      overflow-x: auto;
      border-collapse: collapse;
    }
    .markdown :where(th, td) {
      padding: 0.25rem 0.6rem;
      border: 1px solid rgb(0 0 0 / 15%);
    }
  `,
})
export class MarkdownComponent {
  readonly markdown = input('');

  /** Heading level the README's `#` is rendered as; 2 sits below a page `h1`. */
  readonly topLevel = input(2);

  private readonly sanitizer = inject(DomSanitizer);
  private readonly marked = computed(() => markedWithHeadingsFrom(this.topLevel()));

  protected readonly html = computed(() => {
    const parsed = this.marked().parse(this.markdown(), { async: false });
    return this.sanitizer.bypassSecurityTrustHtml(purifier.sanitize(parsed));
  });
}
