'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Globe, Plus, CheckCircle, AlertCircle } from 'lucide-react';

type Tenant = { id: string; name: string; slug: string };
type TenantDomain = { id: string; domain: string; is_primary: boolean; verified: boolean };

export default function DomainManager() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [domain, setDomain] = useState('');
  const [domains, setDomains] = useState<TenantDomain[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // 🔹 Load tenants for dropdown (only ones user has access to)
  useEffect(() => {
    const loadTenants = async () => {
      const { data, error } = await supabase
        .from('user_tenants')
        .select(`
          tenant_id,
          tenants!inner(id, name, slug)
        `)
        .order('tenants(name)');
      
      if (error) {
        toast({
          title: 'Error',
          description: error.message,
          variant: 'destructive'
        });
      } else {
        // Extract tenant data from the joined query
        const tenantData = data?.map(item => item.tenants).filter(Boolean) || [];
        setTenants(tenantData as unknown as Tenant[]);
      }
    };
    loadTenants();
  }, [toast]);

  // 🔹 Load domains for selected tenant
  useEffect(() => {
    const loadDomains = async () => {
      if (!tenantId) return setDomains([]);
      const { data, error } = await supabase
        .from('tenant_domains')
        .select('id, domain, is_primary, verified')
        .eq('tenant_id', tenantId);
      if (error) {
        toast({
          title: 'Error',
          description: error.message,
          variant: 'destructive'
        });
      } else {
        setDomains(data || []);
      }
    };
    loadDomains();
  }, [tenantId, toast]);

  // 🔹 Add new domain
  const handleAddDomain = async () => {
    if (!tenantId || !domain) {
      toast({
        title: 'Error',
        description: 'Select a tenant and enter a domain.',
        variant: 'destructive'
      });
      return;
    }
    setLoading(true);

    try {
      const res = await fetch('/api/domains/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, domain }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add domain.');
      }

      toast({
        title: 'Success',
        description: 'Domain linked successfully.'
      });
      setDomain('');
      
      // refresh domain list
      const { data } = await supabase
        .from('tenant_domains')
        .select('id, domain, is_primary, verified')
        .eq('tenant_id', tenantId);
      setDomains(data || []);
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Tenant Domain Management</h1>
        <p className="text-gray-600">Manage custom domains for tenant sites</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add New Domain</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Tenant selection */}
          <div>
            <label className="text-sm font-medium">Select Tenant</label>
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="w-full border rounded-md p-2 mt-1"
            >
              <option value="">-- Choose a tenant --</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.slug})
                </option>
              ))}
            </select>
          </div>

          {/* Domain input */}
          <div>
            <label className="text-sm font-medium">Custom Domain</label>
            <Input
              placeholder="e.g. flyparks.co.uk"
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
            />
          </div>

          <Button onClick={handleAddDomain} disabled={loading}>
            {loading ? 'Adding...' : 'Add Domain'}
          </Button>

          <p className="text-sm text-muted-foreground">
            Ensure the domain is configured in Vercel before adding it here.
          </p>
        </CardContent>
      </Card>

      {/* Existing domains */}
      {tenantId && (
        <Card>
          <CardHeader>
            <CardTitle>Existing Domains</CardTitle>
          </CardHeader>
          <CardContent>
            {domains.length === 0 ? (
              <p className="text-sm text-muted-foreground">No domains linked to this tenant yet.</p>
            ) : (
              <ul className="divide-y">
                {domains.map((d) => (
                  <li key={d.id} className="py-2 flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <Globe className="h-4 w-4 text-gray-400" />
                      <span className="font-medium">{d.domain}</span>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant={d.verified ? "default" : "secondary"}>
                        {d.verified ? '✅ verified' : '❌ unverified'}
                      </Badge>
                      {d.is_primary && (
                        <Badge variant="outline">primary</Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Instructions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="text-sm text-gray-600 space-y-2">
            <p><strong>Step 1:</strong> Select the tenant from the dropdown</p>
            <p><strong>Step 2:</strong> Enter the custom domain (e.g., flyparks.co.uk)</p>
            <p><strong>Step 3:</strong> Click "Add Domain" to link the domain to the tenant</p>
            <p><strong>Step 4:</strong> Configure the domain in Vercel to point to your app</p>
          </div>
          <div className="bg-blue-50 p-3 rounded-md">
            <p className="text-sm text-blue-800">
              <strong>Note:</strong> The domain must be configured in Vercel before adding it here. 
              The middleware will automatically route custom domains to the correct tenant site.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
