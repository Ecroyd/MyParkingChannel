import { requirePlatformAdmin } from "@/lib/guards";
import ApplicationsClient from "./ApplicationsClient";

// Force dynamic rendering for this page since it requires authentication
export const dynamic = 'force-dynamic';

export default async function ApplicationsPage() {
  const { adminClient } = await requirePlatformAdmin();
  
  console.log('Fetching applications with admin client...');
  
  // Fetch applications server-side using admin client
  const { data: applications, error } = await adminClient
    .from('tenant_applications')
    .select('*')
    .order('created_at', { ascending: false });

  console.log('Applications query result:', { applications, error });

  if (error) {
    console.error('Error loading applications:', {
      message: error.message,
      details: error.details,
      hint: error.hint,
      code: error.code
    });
  }
  
  return <ApplicationsClient initialApplications={applications || []} />;
}