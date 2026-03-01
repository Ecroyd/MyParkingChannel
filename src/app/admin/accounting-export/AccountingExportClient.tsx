'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Accounting export is merged into Analytics.
 * This component only redirects; the real UI lives on /admin/analytics.
 */
export default function AccountingExportClient() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/admin/analytics');
  }, [router]);
  return null;
}
