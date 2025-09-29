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
    <div className="flex h-screen bg-[#f9fafb] text-gray-900">
      {/* Sidebar */}
      <Sidebar features={isPlatformAdmin ? ['platform_admin'] : []} />
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-glass-gradient">
        {/* Top Header */}
        <header className="bg-white/80 backdrop-blur-md shadow-sm border-b px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              {tenant?.logo_url ? (
                <img 
                  src={tenant.logo_url} 
                  alt={tenant.name || "Tenant Logo"} 
                  className="h-10 w-auto max-w-32 object-contain rounded shadow-sm"
                  style={{ minHeight: '32px', maxHeight: '48px' }}
                />
              ) : null}
              <h1 className="text-xl font-semibold text-gray-900">
                {tenant?.name ? `${tenant.name} Admin` : "Parking Channel Admin"}
              </h1>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-600">Welcome, {user?.email}</span>
              <button
                onClick={handleLogout}
                className="text-sm text-gray-600 hover:text-gray-900 px-3 py-1 rounded hover:bg-gray-100"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-6">
          {children}
        </main>
      </div>
      
      {/* PWA Install Button */}
      <InstallPWAButton />
    </div>
  );
}
