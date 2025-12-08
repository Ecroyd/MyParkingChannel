// Server component for APH SFTP channel management
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/server';
import AphChannelCard from '@/components/admin/aph/AphChannelCard';

export default async function AphIntegrationPage() {
  const supabase = await createServerClient();
  const adminClient = createAdminClient();

  // Get current user
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-2">APH SFTP Rate Export</h1>
        <p className="text-sm text-gray-600">Please log in to continue</p>
      </div>
    );
  }

  // Get user's default tenant
  const { data: userTenants, error: userTenantsError } = await adminClient
    .from('user_tenants')
    .select('tenant_id, role, is_default')
    .eq('user_id', user.id);

  if (userTenantsError || !userTenants?.length) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-2">APH SFTP Rate Export</h1>
        <p className="text-sm text-gray-600">No tenant access found</p>
      </div>
    );
  }

  // Find the default tenant or use the first one
  const userTenant = userTenants.find(ut => ut.is_default) || userTenants[0];

  if (!userTenant?.tenant_id) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-2">APH SFTP Rate Export</h1>
        <p className="text-sm text-gray-600">No tenant found</p>
      </div>
    );
  }

  const tenantId = userTenant.tenant_id;

  // Load APH channel configuration
  const { data: aphChannel, error: channelError } = await adminClient
    .from('tenant_integration_channels')
    .select('id, enabled, config')
    .eq('tenant_id', tenantId)
    .eq('provider', 'aph_sftp')
    .maybeSingle();

  if (channelError && channelError.code !== 'PGRST116') {
    console.error('[APH] Error fetching channel:', channelError);
  }

  // Load recent exports (only if channel exists)
  let exports: any[] = [];
  if (aphChannel?.id) {
    const { data: exportsData, error: exportsError } = await adminClient
      .from('aph_rate_exports')
      .select('id, filename, rows_count, status, error_message, ran_at')
      .eq('tenant_id', tenantId)
      .eq('channel_id', aphChannel.id)
      .order('ran_at', { ascending: false })
      .limit(20);

    if (exportsError) {
      console.error('[APH] Error fetching exports:', exportsError);
    } else {
      exports = exportsData || [];
    }
  }

  // Get last export time (from most recent successful export)
  let lastExportAt: string | null = null;
  if (aphChannel?.id) {
    const { data: lastSuccessExport } = await adminClient
      .from('aph_rate_exports')
      .select('ran_at')
      .eq('tenant_id', tenantId)
      .eq('channel_id', aphChannel.id)
      .eq('status', 'success')
      .order('ran_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastSuccessExport) {
      lastExportAt = lastSuccessExport.ran_at;
    }
  }

  return (
    <div className="p-6">
      <AphChannelCard
        tenantId={tenantId}
        initialChannel={
          aphChannel
            ? {
                id: aphChannel.id,
                enabled: aphChannel.enabled,
                config: aphChannel.config,
                last_export_at: lastExportAt,
              }
            : null
        }
        recentExports={(exports || []) as Array<{
          id: string;
          filename: string;
          rows_count: number;
          status: 'success' | 'failed';
          error_message: string | null;
          ran_at: string;
        }>}
      />
    </div>
  );
}
