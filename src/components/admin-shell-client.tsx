'use client';

import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@supabase/ssr';
import { Menu, X } from 'lucide-react';
import { DynamicPricingBadge } from './admin/DynamicPricingBadge';
import { CavuSyncHealthBanner } from './admin/CavuSyncHealthBanner';
import { EmailParseFailureBanner } from './admin/EmailParseFailureBanner';
import { IngestCanaryHealthBanner, type IngestCanaryHealthResult } from './admin/IngestCanaryHealthBanner';
import Sidebar from '@/components/admin/Sidebar';
import MobileSidebar from '@/components/admin/MobileSidebar';
import InstallPWAButton from '@/components/InstallPWAButton';

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

import type { UserRole } from '@/lib/auth/permissions';

const FRESH_MS = 60_000;   // initialData considered fresh for 60s (skip mount fetch)
const STALE_MS = 120_000;  // on visibility change, only refetch if data older than 120s

export interface InitialHealthData {
  canary: unknown;
  emailParse: unknown;
  cavu: unknown;
  updatedAt: string;
}

interface AdminShellClientProps {
  children: ReactNode;
  user: any;
  tenant: any;
  isPlatformAdmin: boolean;
  userRole: UserRole;
  initialHealthData?: InitialHealthData | null;
}

export default function AdminShellClient({
  children,
  user,
  tenant,
  isPlatformAdmin,
  userRole,
  initialHealthData = null,
}: AdminShellClientProps) {
  const router = useRouter();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [healthSnapshot, setHealthSnapshot] = useState<{ canary: unknown; emailParse: unknown; cavu: unknown } | null>(() => {
    if (!initialHealthData?.updatedAt) return null;
    const age = Date.now() - new Date(initialHealthData.updatedAt).getTime();
    if (age < FRESH_MS) {
      return { canary: initialHealthData.canary, emailParse: initialHealthData.emailParse, cavu: initialHealthData.cavu };
    }
    return null;
  });
  const [healthLoading, setHealthLoading] = useState(() => {
    if (initialHealthData?.updatedAt) {
      const age = Date.now() - new Date(initialHealthData.updatedAt).getTime();
      if (age < FRESH_MS) return false;
    }
    return true;
  });
  const lastFetchedAtRef = useRef<string | null>(initialHealthData?.updatedAt ?? null);

  const fetchHealthSnapshot = useCallback(async () => {
    const res = await fetch('/api/admin/health-snapshot');
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = json?.error ?? res.statusText ?? 'Health snapshot failed';
      throw new Error(`${res.status}: ${msg}`);
    }
    if (!json.ok) throw new Error(json.error || 'Health snapshot failed');
    return json;
  }, []);

  const refetchHealth = useCallback(async () => {
    setHealthLoading(true);
    try {
      const data = await fetchHealthSnapshot();
      setHealthSnapshot({ canary: data.canary, emailParse: data.emailParse, cavu: data.cavu });
      lastFetchedAtRef.current = new Date().toISOString();
    } catch (err) {
      console.error('[HEALTH] refetch failed', err);
    } finally {
      setHealthLoading(false);
    }
  }, [fetchHealthSnapshot]);

  // Mount: only fetch if no fresh initialData (skip when we already have snapshot and not loading)
  useEffect(() => {
    if (healthSnapshot !== null && !healthLoading) return; // already have fresh initial
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchHealthSnapshot();
        if (!cancelled) {
          setHealthSnapshot({ canary: data.canary, emailParse: data.emailParse, cavu: data.cavu });
          lastFetchedAtRef.current = new Date().toISOString();
        }
      } catch (err) {
        if (!cancelled) console.error('[HEALTH] mount fetch failed', err);
      } finally {
        if (!cancelled) setHealthLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- run once on mount

  // Visibility: only refetch if data is stale (older than STALE_MS)
  useEffect(() => {
    const onVisibilityChange = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
      const last = lastFetchedAtRef.current;
      if (!last) return;
      const age = Date.now() - new Date(last).getTime();
      if (age < STALE_MS) return;
      refetchHealth();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
  }, [refetchHealth]);

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
      <Sidebar features={isPlatformAdmin ? ['platform_admin'] : []} userRole={userRole} />

      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <header className="shrink-0 bg-white/80 backdrop-blur-md shadow-sm border-b px-4 md:px-6 py-4">
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

        <main className="flex-1 min-h-0 min-h-[50vh] overflow-y-auto overflow-x-hidden p-4 md:p-6 bg-[#f9fafb]">
          <div className="space-y-4">
            <IngestCanaryHealthBanner
              isPlatformAdmin={isPlatformAdmin}
              canary={(healthSnapshot?.canary ?? null) as IngestCanaryHealthResult | null}
              isLoading={healthLoading}
              onRefetch={refetchHealth}
            />
            <EmailParseFailureBanner
              emailParse={(healthSnapshot?.emailParse ?? null) as Parameters<typeof EmailParseFailureBanner>[0]['emailParse']}
              isLoading={healthLoading}
              onRefetch={refetchHealth}
            />
            <CavuSyncHealthBanner
              cavu={(healthSnapshot?.cavu ?? null) as Parameters<typeof CavuSyncHealthBanner>[0]['cavu']}
              isLoading={healthLoading}
              onRefetch={refetchHealth}
            />
          </div>
          <div className="pt-4 min-h-0">
            {children}
          </div>
        </main>
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
