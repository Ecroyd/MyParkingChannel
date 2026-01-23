import { getServerSupabase } from "@/lib/supabase/server";
import { getCurrentTenantContext } from "@/lib/auth/current-tenant-context";
import ParsedFilesClient from "./ParsedFilesClient";

export default async function ParsedFilesPage() {
  const supabase = await getServerSupabase();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  
  if (authError || !user) {
    return <div>Unauthorized</div>;
  }

  const ctx = await getCurrentTenantContext();
  if (!ctx) {
    return <div>No tenant context</div>;
  }

  return <ParsedFilesClient tenantId={ctx.tenantId} />;
}
