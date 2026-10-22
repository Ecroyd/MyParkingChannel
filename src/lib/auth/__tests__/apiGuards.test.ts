import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let sessionUser: { id: string } | null = null;
let platformAdmins = new Set<string>();
let memberships: Array<{ user_id: string; tenant_id: string; role: string }> = [];

vi.mock('@/lib/supabase/server', () => ({
  getServerSupabase: async () => ({
    auth: { getUser: async () => ({ data: { user: sessionUser } }) },
  }),
}));

vi.mock('@/lib/guards', () => ({
  isPlatformAdmin: async (id: string) => platformAdmins.has(id),
}));

vi.mock('@/lib/supabase/server-admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const filters: Record<string, string> = {};
      const q = {
        select: () => q,
        eq: (col: string, val: string) => {
          filters[col] = val;
          return q;
        },
        maybeSingle: async () => ({
          data:
            memberships.find(
              (m) => m.user_id === filters.user_id && m.tenant_id === filters.tenant_id
            ) ?? null,
        }),
      };
      return q;
    },
  }),
}));

import {
  requirePlatformAdminApi,
  requireTenantMemberApi,
  requireCronOrTenantMemberApi,
  requireCronOrPlatformAdminApi,
} from '../apiGuards';

const TENANT_A = 'tenant-a';
const TENANT_B = 'tenant-b';

beforeEach(() => {
  sessionUser = null;
  platformAdmins = new Set();
  memberships = [
    { user_id: 'owner-a', tenant_id: TENANT_A, role: 'owner' },
    { user_id: 'ops-a', tenant_id: TENANT_A, role: 'ops' },
  ];
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('requireTenantMemberApi', () => {
  it('rejects anonymous callers with 401', async () => {
    const g = await requireTenantMemberApi(TENANT_A);
    expect(g.response?.status).toBe(401);
  });

  it('rejects members of a different tenant with 403', async () => {
    sessionUser = { id: 'owner-a' };
    const g = await requireTenantMemberApi(TENANT_B);
    expect(g.response?.status).toBe(403);
  });

  it('rejects a missing tenant id', async () => {
    sessionUser = { id: 'owner-a' };
    const g = await requireTenantMemberApi(undefined);
    expect(g.response?.status).toBe(403);
  });

  it('enforces roles', async () => {
    sessionUser = { id: 'ops-a' };
    expect((await requireTenantMemberApi(TENANT_A, ['owner', 'admin'])).response?.status).toBe(403);
    expect((await requireTenantMemberApi(TENANT_A, ['owner', 'admin', 'ops'])).ok).toBe(true);
  });

  it('allows a member of the tenant', async () => {
    sessionUser = { id: 'owner-a' };
    const g = await requireTenantMemberApi(TENANT_A, ['owner']);
    expect(g.ok).toBe(true);
    expect(g.response).toBeNull();
  });

  it('allows platform admins for any tenant', async () => {
    sessionUser = { id: 'staff' };
    platformAdmins.add('staff');
    const g = await requireTenantMemberApi(TENANT_B, ['owner']);
    expect(g.ok).toBe(true);
  });
});

describe('requirePlatformAdminApi', () => {
  it('rejects tenant owners', async () => {
    sessionUser = { id: 'owner-a' };
    expect((await requirePlatformAdminApi()).response?.status).toBe(403);
  });

  it('allows platform admins', async () => {
    sessionUser = { id: 'staff' };
    platformAdmins.add('staff');
    expect((await requirePlatformAdminApi()).ok).toBe(true);
  });
});

describe('cron variants', () => {
  it('accept a valid job secret without a session', async () => {
    vi.stubEnv('JOB_SECRET', 'job-123');
    const req = new Request('https://x/api', { headers: { 'x-job-secret': 'job-123' } });
    expect((await requireCronOrTenantMemberApi(req, TENANT_A)).ok).toBe(true);
    expect((await requireCronOrPlatformAdminApi(req)).ok).toBe(true);
  });

  it('accept the x-internal-cron-key header', async () => {
    vi.stubEnv('INTERNAL_CRON_KEY', 'internal-1');
    const req = new Request('https://x/api', { headers: { 'x-internal-cron-key': 'internal-1' } });
    expect((await requireCronOrPlatformAdminApi(req)).ok).toBe(true);
  });

  it('reject a wrong secret and fall back to session checks', async () => {
    vi.stubEnv('JOB_SECRET', 'job-123');
    const req = new Request('https://x/api', { headers: { 'x-job-secret': 'nope' } });
    expect((await requireCronOrTenantMemberApi(req, TENANT_A)).response?.status).toBe(401);
  });

  it('do not accept an empty secret when none is configured', async () => {
    vi.stubEnv('JOB_SECRET', '');
    vi.stubEnv('INTERNAL_CRON_KEY', '');
    vi.stubEnv('CRON_SECRET', '');
    const req = new Request('https://x/api', {
      headers: { 'x-job-secret': '', 'x-internal-cron-key': '', authorization: 'Bearer ' },
    });
    expect((await requireCronOrPlatformAdminApi(req)).response?.status).toBe(401);
  });
});
