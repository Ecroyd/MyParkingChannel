import { requirePlatformAdmin } from "@/lib/guards";
import NewTenantClient from "./NewTenantClient";

export default async function NewTenantPage() {
  await requirePlatformAdmin();
  
  return <NewTenantClient />;
}