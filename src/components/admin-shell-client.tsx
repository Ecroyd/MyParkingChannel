'use client';

import { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Menu, X } from 'lucide-react';
import { DynamicPricingBadge } from './admin/DynamicPricingBadge';
import { CavuSyncHealthBanner } from './admin/CavuSyncHealthBanner';
import { EmailParseFailureBanner } from './admin/EmailParseFailureBanner';
import Sidebar from '@/components/admin/Sidebar';
import MobileSidebar from '@/components/admin/MobileSidebar';
import InstallPWAButton from '@/components/InstallPWAButton';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

import type { UserRole } from '@/lib/auth/permissions';

interface AdminShellClientProps {
  children: ReactNode;
  user: any;
  tenant: any;
  isPlatformAdmin: boolean;
  userRole: UserRole;
}

export default function AdminShellClient({ 
  children, 
  user, 
  tenant, 
  isPlatformAdmin,
  userRole
}: AdminShellClientProps) {
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
    <div className="h-screen w-full overflow-hidden">
      <div className="flex h-full w-full">
        {/* Sidebar — fixed width, scrolls independently (Sidebar has its own border/bg) */}
        <div className="h-full w-64 shrink-0 overflow-y-auto hidden md:block">
          <Sidebar features={isPlatformAdmin ? ['platform_admin'] : []} userRole={userRole} />
        </div>

        {/* Right side: header + main */}
        <div className="flex h-full min-w-0 flex-1 flex-col">
          {/* Header — shrink-0 so it never shrinks */}
          <header className="shrink-0 border-b border-gray-200 bg-white/80 backdrop-blur-md shadow-sm px-4 md:px-6 py-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
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
                    alt={tenant.name || 'Tenant Logo'}
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
                  {tenant?.name ? `${tenant.name} Admin` : 'My Parking Channel Admin'}
                </h1>
              </div>
              <div className="flex items-center space-x-2 md:space-x-4">
                <DynamicPricingBadge />
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

          {/* Main content — flex-1 min-h-0 overflow-y-auto is the fix for “blank / pushed to bottom” */}
          <main className="flex-1 min-h-0 overflow-y-auto bg-gray-50">
            <div className="mx-auto w-full max-w-[1600px] p-4">
              <div className="space-y-4">
                <EmailParseFailureBanner />
                <CavuSyncHealthBanner />
              </div>
              <div className="pt-4">
                {children}
              </div>
            </div>
          </main>
        </div>
      </div>

      {/* Mobile Navigation Overlay */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-50 bg-black bg-opacity-50" onClick={() => setIsMobileMenuOpen(false)}>
          <div className="fixed inset-y-0 left-0 w-80 max-w-[85vw] bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between p-4 border-b">
                <div className="flex items-center gap-3">
                  <div className="h-6 w-6 bg-gray-200 rounded flex items-center justify-center text-xs">🅿️</div>
                  <span className="font-semibold text-gray-900">Navigation</span>
                </div>
                <button onClick={() => setIsMobileMenuOpen(false)} className="p-2 rounded-lg hover:bg-gray-100">
                  <X className="h-5 w-5 text-gray-700" />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto p-4">
                <MobileSidebar features={isPlatformAdmin ? ['platform_admin'] : []} userRole={userRole} />
              </div>
            </div>
          </div>
        </div>
      )}

      <InstallPWAButton />
    </div>
  );
}
