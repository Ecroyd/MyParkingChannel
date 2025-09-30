'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  MoreHorizontal, 
  ExternalLink, 
  Copy, 
  Settings, 
  Users, 
  Calendar,
  Globe,
  CheckCircle,
  AlertCircle,
  Edit,
  Trash2
} from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import Link from 'next/link';

interface TenantCardProps {
  tenant: {
    id: string;
    name: string;
    slug: string;
    created_at: string;
    user_tenants: Array<{
      user_id: string;
      role: string;
    }>;
  };
  onDelete?: (tenantId: string) => void;
  onCopyWidget?: (tenantSlug: string) => void;
}

export default function TenantCard({ tenant, onDelete, onCopyWidget }: TenantCardProps) {
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const hasOwner = tenant.user_tenants.some(ut => ut.role === 'owner');
  const ownerCount = tenant.user_tenants.filter(ut => ut.role === 'owner').length;
  const memberCount = tenant.user_tenants.length;
  
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };
  
  const copyWidgetSnippet = () => {
    const snippet = `<script src="${window.location.origin}/widget/${tenant.slug}.js"></script>`;
    navigator.clipboard.writeText(snippet);
    toast({
      title: 'Widget copied',
      description: 'Booking widget snippet copied to clipboard',
    });
  };
  
  const copyTenantSite = () => {
    const url = `${window.location.origin}/sites/${tenant.slug}`;
    navigator.clipboard.writeText(url);
    toast({
      title: 'URL copied',
      description: 'Tenant site URL copied to clipboard',
    });
  };
  
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg">{tenant.name}</CardTitle>
            <p className="text-sm text-gray-600">/{tenant.slug}</p>
          </div>
          <div className="flex items-center gap-2">
            {hasOwner ? (
              <Badge variant="default" className="bg-green-100 text-green-800">
                <CheckCircle className="h-3 w-3 mr-1" />
                Active
              </Badge>
            ) : (
              <Badge variant="secondary" className="bg-yellow-100 text-yellow-800">
                <AlertCircle className="h-3 w-3 mr-1" />
                No Owner
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-gray-500" />
            <span>{memberCount} member{memberCount !== 1 ? 's' : ''}</span>
          </div>
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-gray-500" />
            <span>Created {formatDate(tenant.created_at)}</span>
          </div>
        </div>
        
        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={copyWidgetSnippet}
            className="flex-1"
          >
            <Copy className="h-4 w-4 mr-1" />
            Copy Widget
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={copyTenantSite}
            className="flex-1"
          >
            <Globe className="h-4 w-4 mr-1" />
            Copy Site URL
          </Button>
        </div>
        
        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="flex-1">
            <Link href={`/admin/tenants/${tenant.id}/edit`}>
              <Edit className="h-4 w-4 mr-1" />
              Edit
            </Link>
          </Button>
          
          <Button asChild variant="outline" size="sm" className="flex-1">
            <Link href={`/admin/tenants/${tenant.id}/widget`}>
              <Copy className="h-4 w-4 mr-1" />
              Widget
            </Link>
          </Button>
        </div>
        
        {/* Delete Button */}
        {onDelete && (
          <Button 
            variant="destructive" 
            size="sm" 
            className="w-full"
            onClick={() => setShowDeleteConfirm(true)}
            disabled={loading}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete Tenant
          </Button>
        )}
        
        <Button asChild variant="outline" size="sm" className="w-full">
          <Link href={`/sites/${tenant.slug}`} target="_blank">
            <ExternalLink className="h-4 w-4 mr-1" />
            View Site
          </Link>
        </Button>
      </CardContent>
      
      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Tenant</h3>
            <p className="text-gray-600 mb-4">
              Are you sure you want to delete <strong>{tenant.name}</strong>? This action cannot be undone and will permanently remove all associated data.
            </p>
            <div className="flex gap-3 justify-end">
              <Button 
                variant="outline" 
                onClick={() => setShowDeleteConfirm(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={async () => {
                  setLoading(true);
                  try {
                    await onDelete?.(tenant.id);
                    setShowDeleteConfirm(false);
                  } catch (error) {
                    console.error('Error deleting tenant:', error);
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
              >
                {loading ? 'Deleting...' : 'Delete Tenant'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
