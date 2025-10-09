'use client';

import { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Menu, X } from 'lucide-react';
import Sidebar from '@/components/admin/Sidebar';
import MobileSidebar from '@/components/admin/MobileSidebar';
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
    <div className="flex h-screen bg-[#f9fafb] text-gray-900">
      {/* Desktop Sidebar */}
      <Sidebar features={isPlatformAdmin ? ['platform_admin'] : []} />
      
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
                  <MobileSidebar features={isPlatformAdmin ? ['platform_admin'] : []} />
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
