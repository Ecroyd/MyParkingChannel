// src/app/api/admin/tenants/orphans/adopt/route.ts
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server-admin';

export async function POST(req: Request) {
  try {
    const { tenantId, ownerEmail } = await req.json();
    console.log('Adopt orphan request:', { tenantId, ownerEmail });
    
    if (!tenantId || !ownerEmail) {
      return NextResponse.json({ error: { code:'BAD_REQ', message:'tenantId and ownerEmail required' }}, { status: 400 });
    }
    const sb = await createAdminClient();

    // Resolve or create user
    let ownerId: string;
    console.log('Looking up user by email:', ownerEmail);
    // Try to find existing user by listing all users and filtering by email
    const { data: users, error: listError } = await sb.auth.admin.listUsers();
    
    if (listError) {
      console.error('Error listing users:', listError);
      throw listError;
    }
    
    const existingUser = users?.users?.find(u => u.email === ownerEmail);
    
    if (existingUser) {
      console.log('User found:', existingUser.id);
      ownerId = existingUser.id;
    } else {
      console.log('User not found, creating user with email:', ownerEmail);
      const { data: created, error: createErr } = await sb.auth.admin.createUser({
        email: ownerEmail,
        email_confirm: false,
      });
      
      if (createErr || !created?.user) {
        console.error('Error creating user:', createErr);
        throw createErr ?? new Error('User creation failed');
      }
      
      ownerId = created.user.id;
      console.log('User created:', ownerId);
    }

    // Upsert owner membership
    console.log('Creating user_tenants relationship:', { tenantId, ownerId });
    const { error: utErr } = await sb.from('user_tenants')
      .upsert({ tenant_id: tenantId, user_id: ownerId, role: 'owner' }, { onConflict: 'tenant_id,user_id' });
    if (utErr) {
      console.error('Error creating user_tenants relationship:', utErr);
      throw utErr;
    }

    console.log('Successfully adopted orphan tenant');
    return NextResponse.json({ tenantId, ownerUserId: ownerId, ownerEmail }, { status: 200 });
  } catch (err: any) {
    console.error('adopt orphan error:', err);
    return NextResponse.json({ error: { code: err.code ?? 'ADOPT', message: err.message ?? 'Failed' }}, { status: 500 });
  }
}
