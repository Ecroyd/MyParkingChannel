// app/admin/payments/page.tsx
import { redirect } from 'next/navigation';
import { getCurrentTenantContext } from '@/lib/auth/current-tenant-context';
import { canViewFinancials } from '@/lib/auth/permissions';
import PaymentsClient from './PaymentsClient';

export default async function PaymentsAdmin() {
  const ctx = await getCurrentTenantContext();
  
  if (!ctx) {
    redirect('/login');
  }

  if (!canViewFinancials(ctx.role)) {
    redirect('/admin');
  }

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-semibold mb-4">Payments</h1>
      <PaymentsClient />
    </main>
  );
}