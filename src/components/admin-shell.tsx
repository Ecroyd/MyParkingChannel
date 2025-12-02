'use client';

import { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Menu, X } from 'lucide-react';
import Sidebar from '@/components/admin/Sidebar';
import MobileSidebar from '@/components/admin/MobileSidebar';
import InstallPWAButton from '@/components/InstallPWAButton';
import type { UserRole } from '@/lib/auth/permissions';

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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [userRole, setUserRole] = useState<UserRole>('user');
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

      if (tenantError) {
        console.error("🔴 Supabase user_tenants fetch error:", tenantError);
      } else {
        console.log("✅ Supabase user_tenants fetch result:", userTenant);
      }

      if (!tenantError && userTenant?.tenants) {
        const tenant = Array.isArray(userTenant.tenants) ? userTenant.tenants[0] : userTenant.tenants;
        
        // Set user role
        if (userTenant.role) {
          setUserRole(userTenant.role as UserRole);
        }
        
        // Get logo from tenant_public_profile
        const { data: profile, error: profileError } = await supabase
          .from('tenant_public_profile')
          .select('logo_url')
          .eq('tenant_id', tenant.id)
          .maybeSingle();

        if (profileError) {
          console.error("🔴 Supabase tenant_public_profile fetch error:", profileError);
        } else {
          console.log("✅ Supabase tenant_public_profile fetch result:", profile);
        }
        
        // Add logo_url to tenant object
        setTenant({
          ...tenant,
          logo_url: profile?.logo_url || tenant.brand_logo_url
        });
      }

      // Check if user is platform admin (jcecroyd@gmail.com)
      const { data: platformAdmin, error: platformAdminError } = await supabase
        .from('platform_admins')
        .select('user_id')
        .eq('user_id', session.user.id)
        .maybeSingle();

      if (platformAdminError) {
        console.error("🔴 Supabase platform_admins fetch error:", platformAdminError);
      } else {
        console.log("✅ Supabase platform_admins fetch result:", platformAdmin);
      }
      
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
      {/* Desktop Sidebar */}
      <Sidebar features={isPlatformAdmin ? ['platform_admin'] : []} userRole={userRole} />
      
      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden bg-glass-gradient">
        {/* Top Header */}
        <header className="bg-white/80 backdrop-blur-md shadow-sm border-b px-4 md:px-6 py-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              {/* Mobile Menu Button */}
              <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
                aria-label="Toggle mobile menu"
              >
                {isMobileMenuOpen ? (
                  <X className="h-6 w-6 text-gray-700" />
                ) : (
                  <Menu className="h-6 w-6 text-gray-700" />
                )}
              </button>
              
              {tenant?.logo_url ? (
                <img 
                  src={tenant.logo_url} 
                  alt={tenant.name || "Tenant Logo"} 
                  className="h-10 w-auto max-w-32 object-contain rounded shadow-sm"
                  style={{ minHeight: '32px', maxHeight: '48px' }}
                />
              ) : (
                <img 
                  src="/my parking channel logo.png" 
                  alt="My Parking Channel" 
                  className="h-10 w-auto max-w-32 object-contain"
                  style={{ minHeight: '32px', maxHeight: '48px' }}
                />
              )}
              <h1 className="text-lg md:text-xl font-semibold text-gray-900 truncate">
                {tenant?.name ? `${tenant.name} Admin` : "My Parking Channel Admin"}
              </h1>
            </div>
            <div className="flex items-center space-x-2 md:space-x-4">
              <span className="text-xs md:text-sm text-gray-600 hidden sm:block">Welcome, {user?.email}</span>
              <button
                onClick={handleLogout}
                className="text-xs md:text-sm text-gray-600 hover:text-gray-900 px-2 md:px-3 py-1 rounded hover:bg-gray-100"
              >
                Logout
              </button>
            </div>
          </div>
        </header>

        {/* Mobile Navigation Overlay */}
        {isMobileMenuOpen && (
          <div className="md:hidden fixed inset-0 z-50 bg-black bg-opacity-50" onClick={() => setIsMobileMenuOpen(false)}>
            <div className="fixed inset-y-0 left-0 w-80 max-w-[85vw] bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
              <div className="flex flex-col h-full">
                {/* Mobile Header */}
                <div className="flex items-center justify-between p-4 border-b">
                  <div className="flex items-center gap-3">
                    <div className="h-6 w-6 bg-gray-200 rounded flex items-center justify-center text-xs">
                      🅿️
                    </div>
                    <span className="font-semibold text-gray-900">Navigation</span>
                  </div>
                  <button
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="p-2 rounded-lg hover:bg-gray-100"
                  >
                    <X className="h-5 w-5 text-gray-700" />
                  </button>
                </div>
                
                {/* Mobile Navigation Content */}
                <div className="flex-1 overflow-y-auto p-4">
                  <MobileSidebar features={isPlatformAdmin ? ['platform_admin'] : []} userRole={userRole} />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          {children}
        </main>
      </div>
      
      {/* PWA Install Button */}
      <InstallPWAButton />
    </div>
  );
}

