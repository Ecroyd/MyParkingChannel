// src/app/api/admin/tenants/assign-owner/route.ts
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server-admin';
import { assignOwnerSchema, type AssignOwnerInput } from '@/lib/validation/provisioning';

export async function POST(req: Request) {
  try {
    const raw = await req.json().catch(() => ({}));
    let input: AssignOwnerInput;
    try {
      input = assignOwnerSchema.parse(raw);
    } catch (zerr: any) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: 'Invalid input', issues: zerr?.issues ?? [] } },
        { status: 400 }
      );
    }

    const { tenantId, ownerEmail, invite } = input;
    const sb = createAdminClient();

    // Resolve or create user
    let ownerUserId: string;
    const { data: lookup } = await sb.auth.admin.getUserByEmail(ownerEmail);
    if (lookup?.user) {
      ownerUserId = lookup.user.id;
    } else if (invite) {
      const { data: invited, error: invErr } = await sb.auth.admin.inviteUserByEmail(ownerEmail, {
        redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/login`,
      });
      if (invErr || !invited?.user) throw invErr ?? new Error('Invite failed');
      ownerUserId = invited.user.id;
    } else {
      const { data: created, error: cErr } = await sb.auth.admin.createUser({
        email: ownerEmail,
        email_confirm: false,
      });
      if (cErr || !created?.user) throw cErr ?? new Error('User create failed');
      ownerUserId = created.user.id;
    }

    // Demote any existing owner (other than the new one)
    await sb.from('user_tenants')
      .update({ role: 'admin' })
      .eq('tenant_id', tenantId)
      .eq('role', 'owner')
      .neq('user_id', ownerUserId);

    // Upsert new owner row
    const { error: upErr } = await sb.from('user_tenants')
      .upsert({ tenant_id: tenantId, user_id: ownerUserId, role: 'owner' }, { onConflict: 'tenant_id,user_id' });
    if (upErr) throw upErr;

    return NextResponse.json({ tenantId, ownerUserId, ownerEmail }, { status: 200 });
  } catch (err: any) {
    console.error('assign-owner error:', err);
    return NextResponse.json(
      { error: { code: err?.code ?? 'ASSIGN_ERROR', message: err?.message ?? 'Failed to assign owner' } },
      { status: 500 }
    );
  }
}
