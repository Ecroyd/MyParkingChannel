'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, ArrowLeft, Key } from 'lucide-react';
import Link from 'next/link';

type Tenant = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  user_tenants: Array<{
    user_id: string;
    role: string;
    // user_emails removed - not available in current query
  }>;
};

interface TenantDetailClientProps {
  tenant: Tenant;
}

export default function TenantDetailClient({ tenant }: TenantDetailClientProps) {
  const [name, setName] = useState(tenant.name);
  const [slug, setSlug] = useState(tenant.slug);
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/tenants/${tenant.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          slug,
        }),
      });

      if (response.ok) {
        alert('Tenant updated successfully!');
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to update tenant:', errorData);
        alert(`Failed to update tenant: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error updating tenant:', error);
      alert('Error updating tenant');
    } finally {
      setLoading(false);
    }
  };

  const getOwnerEmail = () => {
    // First try to get from owner_info
    if (tenant.owner_info?.email) {
      return tenant.owner_info.email;
    }
    
    // Fallback to user_tenants if owner_info is not available
    if (tenant.user_tenants && Array.isArray(tenant.user_tenants)) {
      const owner = tenant.user_tenants.find(ut => ut.role === 'owner');
      if (owner) {
        return 'Owner assigned (email not available)';
      }
    }
    
    return 'No owner';
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center space-x-4">
        <Link href="/admin/tenants">
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Tenants
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">{tenant.name}</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Basic Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-600">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Slug</label>
              <Input
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Created</label>
              <p className="text-sm text-gray-900 mt-1">
                {new Date(tenant.created_at).toLocaleString()}
              </p>
            </div>
            <div className="flex space-x-2">
              <Button onClick={handleSave} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Changes
              </Button>
              <Link href={`/admin/tenants/${tenant.id}/set-password`}>
                <Button variant="outline">
                  <Key className="mr-2 h-4 w-4" />
                  Set Password
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Owner Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-600">Owner Email</label>
              <p className="text-sm text-gray-900 mt-1">
                {getOwnerEmail()}
              </p>
            </div>
            {tenant.owner_info?.phone && (
              <div>
                <label className="text-sm font-medium text-gray-600">Phone</label>
                <p className="text-sm text-gray-900 mt-1">{tenant.owner_info.phone}</p>
              </div>
            )}
            <div>
              <label className="text-sm font-medium text-gray-600">Role</label>
              <div className="mt-1">
                <Badge variant="default">Owner</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Site Information</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div>
              <label className="text-sm font-medium text-gray-600">Site URL</label>
              <p className="text-sm text-gray-900">
                <a 
                  href={`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3002'}/sites/${tenant.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3002'}/sites/{tenant.slug}
                </a>
              </p>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-600">Admin URL</label>
              <p className="text-sm text-gray-900">
                <a 
                  href={`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3002'}/admin`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3002'}/admin
                </a>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
