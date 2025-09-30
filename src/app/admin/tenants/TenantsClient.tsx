'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Edit, Trash2, Eye, Plus, Building2, Users, Search } from 'lucide-react';
import Link from 'next/link';
import TenantCard from '@/components/tenants/TenantCard';

type Tenant = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  user_tenants: Array<{
    user_id: string;
    role: string;
  }>;
};

interface TenantsClientProps {
  initialTenants: Tenant[];
}

export default function TenantsClient({ initialTenants }: TenantsClientProps) {
  const [tenants, setTenants] = useState<Tenant[]>(initialTenants);
  const [filteredTenants, setFilteredTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Filter tenants based on search term
  const filterTenants = () => {
    let filtered = tenants;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(tenant =>
        tenant.name.toLowerCase().includes(term) ||
        tenant.slug.toLowerCase().includes(term) ||
        tenant.user_tenants.some(ut => ut.role === 'owner') // Check if has owner
      );
    }

    setFilteredTenants(filtered);
  };

  // Update filtered tenants when search term or tenants change
  useEffect(() => {
    filterTenants();
  }, [searchTerm, tenants]);

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
  };

  const handleDelete = async (tenantId: string) => {
    setActionLoading(tenantId);
    try {
      const response = await fetch(`/api/admin/tenants/${tenantId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setTenants(prev => prev.filter(t => t.id !== tenantId));
        setFilteredTenants(prev => prev.filter(t => t.id !== tenantId));
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to delete tenant:', errorData);
        alert(`Failed to delete tenant: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error deleting tenant:', error);
      alert('Error deleting tenant');
    } finally {
      setActionLoading(null);
    }
  };

  const getOwnerEmail = (tenant: Tenant) => {
    const owner = tenant.user_tenants.find(ut => ut.role === 'owner');
    return owner ? 'Owner assigned' : 'No owner';
  };

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="flex space-x-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search tenants..."
            value={searchTerm}
            onChange={handleSearch}
            className="pl-10"
          />
        </div>
        <Button onClick={() => window.location.reload()} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Refresh
        </Button>
      </div>

      {/* Empty State */}
      {tenants.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Building2 className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No tenants yet</h3>
            <p className="text-gray-600 mb-6">
              Create your first tenant to get started with managing parking channels.
            </p>
            <Button asChild>
              <Link href="/admin/tenants/new">
                <Plus className="mr-2 h-4 w-4" />
                Create First Tenant
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : filteredTenants.length === 0 ? (
        <Card className="text-center py-12">
          <CardContent>
            <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No tenants found</h3>
            <p className="text-gray-600 mb-6">
              Try adjusting your search terms or create a new tenant.
            </p>
            <div className="flex gap-3 justify-center">
              <Button variant="outline" onClick={() => setSearchTerm('')}>
                Clear Search
              </Button>
              <Button asChild>
                <Link href="/admin/tenants/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Tenant
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        /* Tenant Cards */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTenants.map((tenant) => (
            <TenantCard
              key={tenant.id}
              tenant={tenant}
              onDelete={handleDelete}
              onCopyWidget={(slug) => {
                const snippet = `<script src="${window.location.origin}/widget/${slug}.js"></script>`;
                navigator.clipboard.writeText(snippet);
              }}
            />
          ))}
        </div>
      )}

      {/* Loading State */}
      {loading && tenants.length > 0 && (
        <div className="text-center py-8">
          <Loader2 className="h-8 w-8 animate-spin text-gray-500 mx-auto" />
          <p className="text-gray-600 mt-4">Loading tenants...</p>
        </div>
      )}
    </div>
  );
}