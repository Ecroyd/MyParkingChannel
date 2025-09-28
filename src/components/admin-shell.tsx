'use client';

import { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import Sidebar from '@/components/admin/Sidebar';
import InstallPWAButton from '@/components/InstallPWAButton';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface AdminShellProps {
  children: ReactNode;
}

export default function AdminShell({ children }: AdminShellProps) {
  const [checking, setChecking] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [tenant, setTenant] = useState<any>(null);
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const router = useRouter();

  const loadTenantData = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session) {
      router.push('/login');
    } else {
      setUser(session.user);
      
      // Get user's tenant
      const { data: userTenant, error: tenantError } = await supabase
        .from('user_tenants')
        .select(`
          tenant_id,
          role,
          tenants (
            id,
            name,
            slug,
            timezone,
            brand_logo_url
          )
        `)
        .eq('user_id', session.user.id)
        .single();

      if (!tenantError && userTenant?.tenants) {
        const tenant = Array.isArray(userTenant.tenants) ? userTenant.tenants[0] : userTenant.tenants;
        
        // Get logo from tenant_public_profile
        const { data: profile } = await supabase
          .from('tenant_public_profile')
          .select('logo_url')
          .eq('tenant_id', tenant.id)
          .maybeSingle();
        
        // Add logo_url to tenant object
        setTenant({
          ...tenant,
          logo_url: profile?.logo_url || tenant.brand_logo_url
        });
      }

      // Check if user is platform admin (jcecroyd@gmail.com)
      const { data: platformAdmin } = await supabase
        .from('platform_admins')
        .select('user_id')
        .eq('user_id', session.user.id)
        .maybeSingle();
      
      setIsPlatformAdmin(!!platformAdmin);
      
      setChecking(false);
    }
  };

  useEffect(() => {
    loadTenantData();
  }, []);

  // Listen for storage events to refresh logo when updated
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'logo-updated') {
        loadTenantData();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push('/login');
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

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

