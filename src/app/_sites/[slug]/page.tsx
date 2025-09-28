export default async function SitePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <div className="min-h-screen flex items-center justify-center bg-blue-50">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-blue-900 mb-4">Hello from tenant site!</h1>
        <p className="text-lg text-blue-700 mb-2">Tenant slug: <code className="bg-blue-100 px-2 py-1 rounded">{slug}</code></p>
        <p className="text-sm text-blue-600">This page is served via subdomain routing</p>
      </div>
    </div>
  );
}