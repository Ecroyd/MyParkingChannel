'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function BookingsPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the new server-side bookings page
    console.log('🔄 Bookings: Redirecting to server-side bookings page...');
    router.replace('/admin/bookings-server');
  }, [router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Redirecting to bookings...</p>
      </div>
    </div>
  );
}
