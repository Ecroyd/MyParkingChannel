'use client';
import { useState } from 'react';

interface CreateTenantFormData {
  tenantName: string;
  tenantSlug: string;
  timezone: string;
  default_capacity: number;
  ownerEmail: string;
  ownerPassword: string;
  siteSlug?: string;
}

export default function CreateTenantModal() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<CreateTenantFormData>({
    tenantName: '',
    tenantSlug: '',
    timezone: 'Europe/London',
    default_capacity: 100,
    ownerEmail: '',
    ownerPassword: '',
    siteSlug: '',
  });

  const timezoneOptions = [
    { value: 'Europe/London', label: 'Europe/London (GMT)' },
    { value: 'Europe/Paris', label: 'Europe/Paris (CET)' },
    { value: 'America/New_York', label: 'America/New_York (EST)' },
    { value: 'America/Los_Angeles', label: 'America/Los_Angeles (PST)' },
    { value: 'Asia/Tokyo', label: 'Asia/Tokyo (JST)' },
    { value: 'Australia/Sydney', label: 'Australia/Sydney (AEST)' },
  ];

  function toSlug(str: string) {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch('/api/admin/provision-tenant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tenant: {
            name: formData.tenantName,
            slug: formData.tenantSlug,
            timezone: formData.timezone,
            default_capacity: formData.default_capacity,
          },
          user: {
            email: formData.ownerEmail,
            password: formData.ownerPassword,
          },
          site: formData.siteSlug ? { slug: formData.siteSlug } : undefined,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error?.message || `Failed (${response.status})`);
      }

      alert(`Success! Tenant "${formData.tenantName}" and user "${formData.ownerEmail}" created successfully.`);
      setOpen(false);
      setFormData({
        tenantName: '',
        tenantSlug: '',
        timezone: 'Europe/London',
        default_capacity: 100,
        ownerEmail: '',
        ownerPassword: '',
        siteSlug: '',
      });
      window.location.reload();
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="bg-black text-white rounded-lg px-4 py-2 hover:bg-gray-800 transition-colors"
      >
        Create Tenant
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-semibold mb-6">Create New Tenant</h2>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Tenant Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Tenant Name *</label>
                  <input
                    type="text"
                    required
                    value={formData.tenantName}
                    onChange={(e) => {
                      setFormData(prev => ({ ...prev, tenantName: e.target.value }));
                      if (!formData.tenantSlug) {
                        setFormData(prev => ({ ...prev, tenantSlug: toSlug(e.target.value) }));
                      }
                    }}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="e.g., Acme Parking Solutions"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Tenant Slug *</label>
                  <input
                    type="text"
                    required
                    value={formData.tenantSlug}
                    onChange={(e) => setFormData(prev => ({ ...prev, tenantSlug: toSlug(e.target.value) }))}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="e.g., acme-parking"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Timezone *</label>
                  <select
                    value={formData.timezone}
                    onChange={(e) => setFormData(prev => ({ ...prev, timezone: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2"
                  >
                    {timezoneOptions.map(tz => (
                      <option key={tz.value} value={tz.value}>{tz.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Default Capacity</label>
                  <input
                    type="number"
                    min="1"
                    value={formData.default_capacity}
                    onChange={(e) => setFormData(prev => ({ ...prev, default_capacity: parseInt(e.target.value) || 100 }))}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="100"
                  />
                </div>
              </div>

              {/* Owner Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Owner Email *</label>
                  <input
                    type="email"
                    required
                    value={formData.ownerEmail}
                    onChange={(e) => setFormData(prev => ({ ...prev, ownerEmail: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="owner@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">Owner Password *</label>
                  <input
                    type="password"
                    required
                    value={formData.ownerPassword}
                    onChange={(e) => setFormData(prev => ({ ...prev, ownerPassword: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2"
                    placeholder="Secure password"
                  />
                </div>
              </div>

              {/* Optional Site Slug */}
              <div>
                <label className="block text-sm font-medium mb-1">Site Slug (Optional)</label>
                <input
                  type="text"
                  value={formData.siteSlug}
                  onChange={(e) => setFormData(prev => ({ ...prev, siteSlug: toSlug(e.target.value) }))}
                  className="w-full border rounded-lg px-3 py-2"
                  placeholder="Leave empty to use tenant slug"
                />
                <p className="text-xs text-gray-500 mt-1">
                  If different from tenant slug. Leave empty to use tenant slug.
                </p>
              </div>

              {/* Submit Buttons */}
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 bg-black text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
                >
                  {loading ? 'Creating...' : 'Create Tenant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}