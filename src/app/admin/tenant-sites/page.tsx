'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TenantSitesPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the new server-side tenant sites page
    console.log('🔄 Tenant Sites: Redirecting to server-side tenant sites page...');
    router.replace('/admin/tenant-sites-server');
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Redirecting to tenant sites...</p>
      </div>
    </div>
  );
}

