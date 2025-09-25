'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function TodayPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the new server-side today page
    router.replace('/admin/today-server');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h2 className="text-lg font-semibold text-gray-900">Redirecting...</h2>
        <p className="text-gray-600">Taking you to the updated Today page</p>
      </div>
    </div>
  );
}