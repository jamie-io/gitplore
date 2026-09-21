import { statSync } from 'node:fs';
import { mergedProjects } from '../../../scripts/lib/portfolio.mjs';
import { ABOUT, Period, documentLinkText, mailtoHref } from './about';

/** A year, or a year and a month: the only precision the CV gives. */
const ISO_PERIOD_PART = /^\d{4}(-(0[1-9]|1[0-2]))?$/;

function expectIsoPeriod(period: Period, what: string): void {
  expect(period.from, `${what}: from`).toMatch(ISO_PERIOD_PART);
  if (period.to !== undefined) {
    expect(period.to, `${what}: to`).toMatch(ISO_PERIOD_PART);
    // A year alone starts in January and ends in December; then lexical order is calendar order.
    const start = period.from.length === 4 ? `${period.from}-01` : period.from;
    const end = period.to.length === 4 ? `${period.to}-12` : period.to;
    expect(end >= start, `${what}: ends before it starts`).toBe(true);
  }
}

describe('about.ts', () => {
  it('names Jamie, a role and a contact address', () => {
    expect(ABOUT.profile.name.trim()).not.toBe('');
    expect(ABOUT.profile.role.trim()).not.toBe('');
    expect(ABOUT.profile.summary.trim()).not.toBe('');
    expect(ABOUT.profile.email).toMatch(/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/);
    expect(mailtoHref(ABOUT.profile.email)).toBe(`mailto:${ABOUT.profile.email}`);
    for (const link of ABOUT.profile.links) {
      expect(link.label.trim()).not.toBe('');
      expect(link.href).toMatch(/^https:\/\//);
    }
  });

  it('dates every career station with an ISO period, oldest first', () => {
    expect(ABOUT.career.length).toBeGreaterThan(0);
    ABOUT.career.forEach((station) => {
      expectIsoPeriod(station.period, station.title);
      expect(station.title.trim()).not.toBe('');
    });
    const starts = ABOUT.career.map((station) => station.period.from.slice(0, 4));
    expect(starts).toEqual([...starts].sort());
  });

  it('gives every work project a unique slug, a title and at least one point', () => {
    const slugs = ABOUT.workProjects.map((project) => project.slug);

    expect(new Set(slugs).size).toBe(slugs.length);
    for (const project of ABOUT.workProjects) {
      expect(project.slug).toMatch(/^[a-z0-9][a-z0-9_-]*$/);
      expect(project.title.trim()).not.toBe('');
      expect(project.points.length, project.slug).toBeGreaterThan(0);
      project.points.forEach((point) => expect(point.trim(), project.slug).not.toBe(''));
      if (project.period) {
        expectIsoPeriod(project.period, project.slug);
      }
    }
  });

  it('keeps work-project slugs apart from the repository projects', () => {
    const repoSlugs = new Set(mergedProjects().map((project) => project.slug));

    for (const project of ABOUT.workProjects) {
      expect(repoSlugs.has(project.slug), project.slug).toBe(false);
    }
  });

  it('points every related repository at a real project', () => {
    const repoSlugs = new Set(mergedProjects().map((project) => project.slug));
    const related = ABOUT.workProjects.flatMap((project) =>
      project.relatedRepo ? [project.relatedRepo] : [],
    );

    // Not a test that passes by having nothing to check: the catalogue shares the demoshop's world.
    expect(related.length).toBeGreaterThan(0);
    for (const slug of related) {
      expect(repoSlugs.has(slug), slug).toBe(true);
    }
  });

  it('dates availability as an ISO month and lists only non-empty entries', () => {
    const { from, regions, roles } = ABOUT.availability;

    if (from) {
      expect(from).toMatch(ISO_PERIOD_PART);
    }
    [...regions, ...roles].forEach((entry) => expect(entry.trim()).not.toBe(''));
  });

  it('lists stated skills without duplicates', () => {
    const names = ABOUT.skills.map((skill) => skill.name);

    expect(new Set(names).size).toBe(names.length);
    ABOUT.skills.forEach((skill) => expect(skill.source).toBe('beruf'));
  });

  it('quotes testimonials only with a source and an ISO date', () => {
    for (const testimonial of ABOUT.testimonials) {
      expect(testimonial.quote.trim()).not.toBe('');
      expect(testimonial.source.trim()).not.toBe('');
      expect(testimonial.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('records each document at exactly the size of the committed file', () => {
    const cv = ABOUT.documents.find((document) => document.label === 'Lebenslauf');

    expect(cv).toBeDefined();
    for (const document of ABOUT.documents) {
      expect(document.href).not.toMatch(/^\//);
      expect(document.bytes).toBe(statSync(`public/${document.href}`).size);
    }
  });

  it('names format and size in every document link', () => {
    const cv = ABOUT.documents.find((document) => document.label === 'Lebenslauf')!;

    expect(documentLinkText(cv)).toBe('Lebenslauf, PDF, 144 kB');
  });
});
