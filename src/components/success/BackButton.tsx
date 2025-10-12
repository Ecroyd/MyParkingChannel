'use client';

interface BackButtonProps {
  tenantId: string;
  tenantName?: string;
  tenantSlug?: string;
}

export default function BackButton({ tenantId, tenantName, tenantSlug }: BackButtonProps) {
  const getBackUrl = () => {
    // If we have a slug, use it; otherwise fall back to the tenant ID
    return tenantSlug ? `/sites/${tenantSlug}` : `/sites/${tenantId}`;
  };

  return (
    <div className="text-center mt-8">
      <button 
        onClick={() => window.location.href = getBackUrl()}
        className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
      >
        Back to {tenantName || 'Car Park'} Website
      </button>
    </div>
  );
}
