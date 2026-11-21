import { describe, expect, it } from 'vitest';
import {
  canEditItem,
  fileLabel,
  filePath,
  isImagePath,
  itemSchema,
  matchesFilters,
  normaliseLink,
  sortItems,
  triageSchema,
} from '../fields';

describe('normaliseLink', () => {
  it('adds https:// when there is no scheme and keeps paths', () => {
    expect(normaliseLink('  myparkingchannel.app/admin  ')).toBe('https://myparkingchannel.app/admin');
    expect(normaliseLink('http://x.test')).toBe('http://x.test');
    expect(normaliseLink('/admin/today-server')).toBe('/admin/today-server');
    expect(normaliseLink('   ')).toBe('');
  });
});

describe('itemSchema', () => {
  const base = { kind: 'bug', area: 'Today', title: ' Board is blank ', description: '', links: [] };

  it('trims, drops empty and duplicate links', () => {
    const r = itemSchema.parse({ ...base, links: ['a.test/x', '', 'https://a.test/x'] });
    expect(r.title).toBe('Board is blank');
    expect(r.links).toEqual(['https://a.test/x']);
  });

  it('rejects an empty title, an unknown area and a non-address link', () => {
    expect(itemSchema.safeParse({ ...base, title: '  ' }).success).toBe(false);
    expect(itemSchema.safeParse({ ...base, area: 'Nowhere' }).success).toBe(false);
    expect(itemSchema.safeParse({ ...base, links: ['not a link'] }).success).toBe(false);
  });
});

describe('triageSchema', () => {
  it('turns a blank reply into null', () => {
    expect(triageSchema.parse({ status: 'planned', reply: '   ' })).toEqual({ status: 'planned', reply: null });
  });
});

describe('canEditItem', () => {
  it('lets the poster and platform admins edit', () => {
    expect(canEditItem({ created_by: 'u1' }, 'u1', false)).toBe(true);
    expect(canEditItem({ created_by: 'u1' }, 'u2', false)).toBe(false);
    expect(canEditItem({ created_by: 'u1' }, 'u2', true)).toBe(true);
  });
});

describe('file paths', () => {
  it('keeps the path inside the tenant and item folder with a safe name', () => {
    const p = filePath('t1', 'i1', 0, '../../My Screen shot!.png');
    expect(p.startsWith('t1/i1/')).toBe(true);
    expect(p).not.toContain('..');
    expect(fileLabel(p)).toBe('My-Screen-shot.png');
    expect(isImagePath(p)).toBe(true);
    expect(isImagePath('t1/i1/1-0-notes.pdf')).toBe(false);
  });
});

describe('filters and sorting', () => {
  const item = (over: Record<string, unknown>) => ({
    kind: 'feature' as const,
    area: 'Today',
    status: 'new' as const,
    title: 'Camera icon',
    description: '',
    created_by_name: 'Nic',
    tenant_name: 'Fly Parks',
    votes: 0,
    created_at: '2026-11-20T10:00:00Z',
    ...over,
  });

  it('shows new and planned under Open', () => {
    const f = { kind: 'all' as const, area: 'all', status: 'open' as const, search: '' };
    expect(matchesFilters(item({ status: 'planned' }), f)).toBe(true);
    expect(matchesFilters(item({ status: 'done' }), f)).toBe(false);
  });

  it('searches title, description, poster and car park', () => {
    const f = { kind: 'all' as const, area: 'all', status: 'all' as const, search: 'fly' };
    expect(matchesFilters(item({}), f)).toBe(true);
    expect(matchesFilters(item({ tenant_name: null }), f)).toBe(false);
  });

  it('sorts most wanted by votes then newest', () => {
    const a = item({ title: 'a', votes: 1, created_at: '2026-11-01T00:00:00Z' });
    const b = item({ title: 'b', votes: 3, created_at: '2026-10-01T00:00:00Z' });
    const c = item({ title: 'c', votes: 1, created_at: '2026-11-10T00:00:00Z' });
    expect(sortItems([a, b, c], 'wanted').map((i) => i.title)).toEqual(['b', 'c', 'a']);
    expect(sortItems([a, b, c], 'newest').map((i) => i.title)).toEqual(['c', 'a', 'b']);
  });
});
