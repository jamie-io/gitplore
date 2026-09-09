import { Component, computed, inject, input } from '@angular/core';
import { DomSanitizer } from '@angular/platform-browser';
import DOMPurify from 'dompurify';
import { Marked, type Tokens } from 'marked';

/** The deepest heading HTML has. */
const MAX_HEADING_LEVEL = 6;

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
    return this.sanitizer.bypassSecurityTrustHtml(DOMPurify.sanitize(parsed));
  });
}
