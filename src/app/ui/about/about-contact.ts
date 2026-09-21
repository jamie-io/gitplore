import { Component, input } from '@angular/core';
import { ABOUT, documentLinkText, mailtoHref } from '@content/about';

/**
 * Who Jamie is and how to reach him: name, role, e-mail and the CV. The contact dialog and the
 * `/projects` header both render this one block from `@content/about`, so the two can never say
 * different things.
 */
@Component({
  selector: 'app-about-contact',
  template: `
    <h2 [id]="headingId()">{{ profile.name }}</h2>
    <p class="role">{{ profile.role }}</p>
    @if (showSummary()) {
      <p class="summary">{{ profile.summary }}</p>
    }
    <ul class="contact">
      <li>
        <a data-role="mail" [href]="mailto">E-Mail: {{ profile.email }}</a>
      </li>
      @for (document of documents; track document.href) {
        <li>
          <a data-role="document" [href]="document.href" download>{{ linkText(document) }}</a>
        </li>
      }
      @for (link of profile.links; track link.href) {
        <li>
          <a data-role="profile-link" [href]="link.href" target="_blank" rel="noopener noreferrer">
            {{ link.label }}
          </a>
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
    }
    h2 {
      margin: 0 0 0.2rem;
      font-size: 1.35rem;
    }
    .role {
      margin: 0 0 0.6rem;
      font-weight: 600;
    }
    .summary {
      margin: 0 0 0.8rem;
      max-inline-size: 60ch;
    }
    .contact {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
      margin: 0;
      padding: 0;
      list-style: none;
    }
    a {
      display: inline-block;
      padding: 0.45rem 0.9rem;
      border: 1px solid currentcolor;
      border-radius: 0.5rem;
      color: inherit;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    a:focus-visible {
      outline: 3px solid #1f5f8b;
      outline-offset: 2px;
    }
  `,
})
export class AboutContact {
  /** The heading's id, so a dialog around this block can be labelled by it. */
  readonly headingId = input('about-heading');
  readonly showSummary = input(false);

  protected readonly profile = ABOUT.profile;
  protected readonly documents = ABOUT.documents;
  protected readonly mailto = mailtoHref(ABOUT.profile.email);
  protected readonly linkText = documentLinkText;
}
