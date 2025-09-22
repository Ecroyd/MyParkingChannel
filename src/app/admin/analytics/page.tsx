import { getCurrentTenant } from '@/lib/tenant';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import AnalyticsDashboard from '@/components/analytics/AnalyticsDashboard';

export default async function AnalyticsPage() {
  let tenant;
  try {
    tenant = await getCurrentTenant();
  } catch (error) {
    return (
      <Card className="shadow-soft">
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <p className="text-gray-600">Tenant Required</p>
            <p className="text-sm text-gray-500">Please complete setup to access analytics.</p>
            <Link href="/admin/setup" className="inline-flex items-center rounded-md border px-3 py-2 text-sm">
              Go to Setup
            </Link>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Analytics Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Comprehensive revenue and occupancy analytics with export capabilities
        </p>
        <p className="text-xs text-muted-foreground">Tenant: {tenant.name} ({tenant.slug})</p>
      </div>
      <AnalyticsDashboard tenantId={tenant.id} />
    </section>
  );
}

