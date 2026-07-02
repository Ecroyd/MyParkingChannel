import { NextRequest, NextResponse } from 'next/server';
import { PATCH as adminPatch } from '@/app/api/admin/bookings/highlight/route';

/** Legacy path — delegates to admin highlight handler. */
export async function PATCH(req: NextRequest) {
  return adminPatch(req);
}
