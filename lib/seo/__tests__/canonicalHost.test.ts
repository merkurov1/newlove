import { canonicalHostRedirect } from '../canonicalHost';

describe('canonical host redirect', () => {
  it('rewrites the apex host to the canonical https www host', () => {
    const target = canonicalHostRedirect(new URL('https://merkurov.love/advising?x=1'));
    expect(target?.toString()).toBe('https://www.merkurov.love/advising?x=1');
  });

  it('upgrades plain http on the canonical host to https', () => {
    const target = canonicalHostRedirect(new URL('http://www.merkurov.love/journal'));
    expect(target?.toString()).toBe('https://www.merkurov.love/journal');
  });

  it('upgrades plain http on the apex host without losing the path', () => {
    const target = canonicalHostRedirect(new URL('http://merkurov.love/ru/lobby'));
    expect(target?.toString()).toBe('https://www.merkurov.love/ru/lobby');
  });

  it('leaves the canonical https origin untouched', () => {
    expect(canonicalHostRedirect(new URL('https://www.merkurov.love/'))).toBeNull();
  });

  it('never redirects preview, localhost or unrelated hosts', () => {
    expect(canonicalHostRedirect(new URL('https://newlove-git-branch.vercel.app/'))).toBeNull();
    expect(canonicalHostRedirect(new URL('http://localhost:3000/'))).toBeNull();
    expect(canonicalHostRedirect(new URL('https://example.com/'))).toBeNull();
  });

  it('uses the forwarded host header when the URL host differs', () => {
    const target = canonicalHostRedirect(new URL('http://internal:3000/lobby'), 'merkurov.love');
    expect(target?.toString()).toBe('https://www.merkurov.love/lobby');
  });
});
