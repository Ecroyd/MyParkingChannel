'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the new server-side dashboard
    router.replace('/admin/dashboard-server');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-gray-900">Redirecting...</h2>
        <p className="text-gray-600">Taking you to the updated Dashboard</p>
      </div>
    </div>
  );
}