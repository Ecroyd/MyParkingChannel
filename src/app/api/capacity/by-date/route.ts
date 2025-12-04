import { NextRequest, NextResponse } from 'next/server';
import { calculateCapacityByDate } from '@/lib/capacity/rolling';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const tenantId = url.searchParams.get('tenant_id');
    const datesParam = url.searchParams.get('dates');

    if (!tenantId) {
      return NextResponse.json({ error: 'tenant_id required' }, { status: 400 });
    }

    if (!datesParam) {
      return NextResponse.json({ error: 'dates required (comma-separated YYYY-MM-DD)' }, { status: 400 });
    }

    // Verify user authentication
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse dates
    const dates = datesParam.split(',').map(d => d.trim()).filter(Boolean);

    // Calculate capacity for all dates
    const capacityByDate = await calculateCapacityByDate(tenantId, dates);

    return NextResponse.json({ capacityByDate });
  } catch (error: any) {
    console.error('Error in /api/capacity/by-date:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

