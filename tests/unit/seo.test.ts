import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// index.html carries the page's search and AI-answer metadata; the app replaces only #app's fallback.
const html = readFileSync('index.html', 'utf8');
const page = new DOMParser().parseFromString(html, 'text/html');
const graph: Record<string, unknown>[] = JSON.parse(page.querySelector('script[type="application/ld+json"]')!.textContent!)['@graph'];
const node = (type: string) => graph.find((g) => g['@type'] === type) as Record<string, any>;

describe('index.html search metadata', () => {
  it('has a title, description, canonical URL and the structured data types', () => {
    expect(page.title).toContain('去标识化');
    expect(page.querySelector('meta[name=description]')!.getAttribute('content')!.length).toBeGreaterThan(80);
    expect(page.querySelector('link[rel=canonical]')!.getAttribute('href')).toBe('__SITE_ROOT__'); // filled from SITE_URL at build time
    expect(graph.map((g) => g['@type'])).toEqual(expect.arrayContaining(['WebSite', 'WebPage', 'WebApplication', 'HowTo', 'FAQPage']));
    expect(node('WebPage').dateModified).toBe('__BUILD_DATE__'); // stamped at build time
  });

  it('answers every FAQ in the structured data word for word as the visible page does', () => {
    const visible = [...page.querySelectorAll('#faq details')].map((d) => [d.querySelector('summary')!.textContent!.trim(), d.querySelector('p')!.textContent!.trim()]);
    const structured = node('FAQPage').mainEntity.map((q: any) => [q.name, q.acceptedAnswer.text]);
    expect(structured).toEqual(visible);
  });

  it('lists the how-to steps in order', () => {
    const steps = node('HowTo').step;
    expect(steps.map((s: any) => s.position)).toEqual(steps.map((_: unknown, i: number) => i + 1));
    expect(steps.length).toBeGreaterThanOrEqual(5);
  });

  // 仓库是公开的，部署地址由 SITE_URL 在构建时注入，源码里不该出现任何具体域名。
  it('leaves every absolute address to SITE_URL instead of hard-coding a domain', () => {
    const absolute = [...page.querySelectorAll('link[rel=canonical], meta[property="og:url"], meta[property="og:image"], meta[name="twitter:image"]')];
    expect(absolute.length).toBeGreaterThan(0);
    for (const el of absolute) {
      const value = el.getAttribute('href') ?? el.getAttribute('content')!;
      expect(value).toMatch(/^__SITE_(ROOT|URL)__/);
    }
    expect(readFileSync('public/sitemap.xml', 'utf8')).toContain('<loc>__SITE_URL__</loc>');
    expect(readFileSync('public/robots.txt', 'utf8')).toContain('Sitemap: __SITE_URL__sitemap.xml');
  });
});
