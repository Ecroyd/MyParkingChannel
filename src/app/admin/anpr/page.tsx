// app/admin/anpr/page.tsx

import AnprAdminClient from '@/components/admin/anpr/AnprAdminClient';

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
};

export default async function AnprPage({ searchParams }: Props) {
  const resolvedSearchParams = await searchParams;
  const tenantIdParam = resolvedSearchParams.tenantId;

  const tenantId =
    typeof tenantIdParam === 'string' ? tenantIdParam : undefined;

  if (!tenantId) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-semibold mb-2">ANPR / Gate Control</h1>
        <p className="text-sm text-gray-600">
          No <code>tenantId</code> provided. Call this page like:{' '}
          <code>/admin/anpr?tenantId=&lt;tenant-uuid&gt;</code> or wire it into
          your existing tenant selector.
        </p>
      </div>
    );
  }

  return <AnprAdminClient tenantId={tenantId} />;
}

