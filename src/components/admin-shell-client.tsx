'use client';

import { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Sidebar from '@/components/admin/Sidebar';
import InstallPWAButton from '@/components/InstallPWAButton';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface AdminShellClientProps {
  children: ReactNode;
  user: any;
  tenant: any;
  isPlatformAdmin: boolean;
}

export default function AdminShellClient({ 
  children, 
  user, 
  tenant, 
  isPlatformAdmin 
}: AdminShellClientProps) {
  const router = useRouter();

  // Listen for storage events to refresh logo when updated
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'logo-updated') {
        window.location.reload();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Admin Dashboard - Testing</h1>
        <p className="text-gray-600 mb-4">User: {user?.email}</p>
        <p className="text-gray-600 mb-4">Tenant: {tenant?.name || 'No tenant'}</p>
        <p className="text-gray-600 mb-4">Platform Admin: {isPlatformAdmin ? 'Yes' : 'No'}</p>
        
        <div className="bg-white p-4 rounded shadow">
          <h2 className="text-lg font-semibold mb-2">Children Content:</h2>
          {children}
        </div>
      </div>
    </div>
  );
}
