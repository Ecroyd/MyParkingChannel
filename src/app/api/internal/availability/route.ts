// app/api/internal/availability/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { calculateAvailability } from '@/lib/availability/engine';
import { getServerSupabase } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    
    // Get authenticated user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } },
        { status: 401 }
      );
    }

    // Get user's tenant
    const { data: userTenant } = await supabase
      .from('user_tenants')
      .select('tenant_id')
      .eq('user_id', user.id)
      .eq('is_default', true)
      .maybeSingle();

    if (!userTenant?.tenant_id) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: 'No tenant found for user',
          },
        },
        { status: 400 }
      );
    }

    const { searchParams } = new URL(req.url);

    const start_at = searchParams.get('start_at');
    const end_at = searchParams.get('end_at');
    const currency = searchParams.get('currency') ?? 'GBP';

    if (!start_at || !end_at) {
      return NextResponse.json(
        {
          error: {
            code: 'INVALID_REQUEST',
            message: 'start_at and end_at are required',
          },
        },
        { status: 400 }
      );
    }

    const availability = await calculateAvailability({
      tenantId: userTenant.tenant_id,
      startAt: start_at,
      endAt: end_at,
      currency,
      channel: 'direct', // Direct site sees full capacity
    });

    return NextResponse.json(availability, { status: 200 });
  } catch (err: any) {
    console.error('Internal availability error', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Unexpected error' } },
      { status: 500 }
    );
  }
}

