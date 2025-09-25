'use client';

import { useEffect, useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CheckCircle, XCircle, Search, Filter, UserPlus, Building } from 'lucide-react';
import { format } from 'date-fns';

type Application = {
  id: string;
  created_at: string;
  applicant_email: string;
  applicant_name: string | null;
  company_name: string | null;
  phone: string | null;
  notes: string | null;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
  reviewed_at: string | null;
};

interface ApplicationsClientProps {
  initialApplications: Application[];
}

export default function ApplicationsClient({ initialApplications }: ApplicationsClientProps) {
  const [applications, setApplications] = useState<Application[]>(initialApplications);
  const [filteredApplications, setFilteredApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    filterApplications();
  }, [applications, searchTerm, statusFilter]);

  async function loadApplications() {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/applications');
      if (response.ok) {
        const data = await response.json();
        setApplications(data.applications || []);
      }
    } catch (error) {
      console.error('Error loading applications:', error);
    } finally {
      setLoading(false);
    }
  }

  function filterApplications() {
    let filtered = applications;

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(app => 
        app.applicant_email.toLowerCase().includes(term) ||
        (app.applicant_name && app.applicant_name.toLowerCase().includes(term)) ||
        (app.company_name && app.company_name.toLowerCase().includes(term))
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(app => app.status === statusFilter);
    }

    setFilteredApplications(filtered);
  }

  async function handleApprove(applicationId: string) {
    setActionLoading(applicationId);
    try {
      const response = await fetch(`/api/admin/applications/${applicationId}/approve`, {
        method: 'POST',
      });

      if (response.ok) {
        await loadApplications();
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to approve application:', {
          status: response.status,
          statusText: response.statusText,
          error: errorData
        });
      }
    } catch (error) {
      console.error('Error approving application:', error);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleReject(applicationId: string) {
    setActionLoading(applicationId);
    try {
      const response = await fetch(`/api/admin/applications/${applicationId}/reject`, {
        method: 'POST',
      });

      if (response.ok) {
        await loadApplications();
      } else {
        console.error('Failed to reject application');
      }
    } catch (error) {
      console.error('Error rejecting application:', error);
    } finally {
      setActionLoading(null);
    }
  }

  function getStatusBadge(status: string) {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">Pending</Badge>;
      case 'approved':
        return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Approved</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Applications</h1>
          <p className="text-gray-600">Manage tenant applications</p>
        </div>
        <Button asChild>
          <a href="/admin/tenants/new">
            <Building className="h-4 w-4 mr-2" />
            Add Tenant Manually
          </a>
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search applications..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48">
            <Filter className="h-4 w-4 mr-2" />
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Applications List */}
      <div className="space-y-4">
        {filteredApplications.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-gray-500">No applications found</p>
            </CardContent>
          </Card>
        ) : (
          filteredApplications.map((app) => (
            <Card key={app.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-semibold text-lg">{app.applicant_name || 'Unknown'}</h3>
                      {getStatusBadge(app.status)}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-600">
                      <div>
                        <strong>Email:</strong> {app.applicant_email}
                      </div>
                      {app.company_name && (
                        <div>
                          <strong>Company:</strong> {app.company_name}
                        </div>
                      )}
                      {app.phone && (
                        <div>
                          <strong>Phone:</strong> {app.phone}
                        </div>
                      )}
                      <div>
                        <strong>Applied:</strong> {format(new Date(app.created_at), 'MMM d, yyyy')}
                      </div>
                    </div>
                    {app.notes && (
                      <div className="mt-3 p-3 bg-gray-50 rounded">
                        <strong>Notes:</strong> {app.notes}
                      </div>
                    )}
                  </div>
                  
                  {app.status === 'pending' && (
                    <div className="flex gap-2 ml-4">
                      <Button
                        onClick={() => handleApprove(app.id)}
                        disabled={actionLoading === app.id}
                        className="bg-green-600 hover:bg-green-700 text-white"
                        size="sm"
                      >
                        <CheckCircle className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        onClick={() => handleReject(app.id)}
                        disabled={actionLoading === app.id}
                        variant="destructive"
                        size="sm"
                      >
                        <XCircle className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
