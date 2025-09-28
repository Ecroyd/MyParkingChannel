import { requirePlatformAdmin } from "@/lib/guards";
import NewTenantClient from "./NewTenantClient";

// Force dynamic rendering for this page since it requires authentication
export const dynamic = 'force-dynamic';

export default async function NewTenantPage() {
  await requirePlatformAdmin();
  
  return <NewTenantClient />;
}