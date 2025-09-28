import { requirePlatformAdmin } from "@/lib/guards";
import { createServerClient } from "@/lib/supabase/server";
import SetPasswordClient from "./SetPasswordClient";

// Force dynamic rendering for this page since it requires authentication
export const dynamic = 'force-dynamic';

export default async function SetPasswordPage({ params }: { params: Promise<{ id: string }> }) {
  const { sb } = await requirePlatformAdmin();
  const { id } = await params;

  // Fetch tenant details
  const { data: tenant, error } = await sb
    .from('tenants')
    .select('id, name, slug')
    .eq('id', id)
    .single();

  if (error || !tenant) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold text-red-600">Tenant not found</h1>
        <p className="text-gray-600 mt-2">The requested tenant could not be found.</p>
      </div>
    );
  }

  // Get tenant owner info (without email for now)
  const { data: userTenants } = await sb
    .from('user_tenants')
    .select(`
      user_id,
      role
    `)
    .eq('tenant_id', id)
    .eq('role', 'owner');

  const ownerEmail = userTenants?.[0] ? 'Owner assigned (email not available)' : 'No owner found';

  return <SetPasswordClient tenant={tenant} ownerEmail={ownerEmail} />;
}
