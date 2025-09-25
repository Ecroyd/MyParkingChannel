'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import EmptyState from '@/components/admin/EmptyState';
import WidgetEmbedCard from '@/components/admin/WidgetEmbedCard';
import ContactSettingsForm from '@/components/admin/ContactSettingsForm';
import { ExternalLink, Eye, Globe, Building2, Settings } from 'lucide-react';

type Tenant = {
  id: string;
  slug: string;
  name: string;
  timezone: string | null;
};

type Site = {
  id: string;
  tenant_id: string;
  slug: string;
  status: 'draft' | 'published';
  template: string;
  primary_domain: string | null;
};

type TenantWithSite = Tenant & {
  site?: Site;
  branding?: {
    app_name: string | null;
    theme_color: string | null;
  };
};

export default function TenantSitesPage() {
  const [user, setUser] = useState<any>(null);
  const [tenants, setTenants] = useState<TenantWithSite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  useEffect(() => {
    async function loadData() {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
          setError('Not authenticated');
          setLoading(false);
          return;
        }

        setUser(user);

        // Get all tenants (for now, we'll get all tenants the user has access to)
        // First, get user_tenants relationships
        const { data: userTenants, error: userTenantsError } = await supabase
          .from('user_tenants')
          .select('role, tenant_id')
          .eq('user_id', user.id);

        if (userTenantsError) {
          console.error('Error fetching user tenants:', userTenantsError);
          setError('Failed to load tenant data');
          setLoading(false);
          return;
        }

        if (userTenants && userTenants.length > 0) {
          // Get tenant details for each relationship
          const tenantIds = userTenants.map(ut => ut.tenant_id);
          const { data: tenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, slug, name, timezone, default_capacity')
            .in('id', tenantIds);

          if (tenantsError) {
            console.error('Error fetching tenants:', tenantsError);
            setError('Failed to load tenant data');
            setLoading(false);
            return;
          }

          // Get site and branding data for each tenant
          
          const [sitesResult, brandingResult] = await Promise.all([
            supabase
              .from('sites')
              .select('id, tenant_id, slug, status, template, primary_domain')
              .in('tenant_id', tenantIds),
            supabase
              .from('tenant_branding')
              .select('tenant_id, app_name, theme_color')
              .in('tenant_id', tenantIds)
          ]);

          const sites = sitesResult.data || [];
          const branding = brandingResult.data || [];

          const tenantsWithSites: TenantWithSite[] = userTenants.map(ut => {
            const tenant = tenants.find(t => t.id === ut.tenant_id);
            if (!tenant) return null; // Skip if tenant not found
            
            const site = sites.find(s => s.tenant_id === tenant.id);
            const tenantBranding = branding.find(b => b.tenant_id === tenant.id);
            
            return {
              ...tenant,
              site,
              branding: tenantBranding
            };
          }).filter(Boolean) as TenantWithSite[];

          setTenants(tenantsWithSites);
        }

        setLoading(false);
      } catch (err) {
        console.error('Load data error:', err);
        setError('Failed to load data');
        setLoading(false);
      }
    }

    loadData();
  }, []);

  if (loading) {
    return (
      <Card className="shadow-soft">
        <CardContent className="p-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading tenant sites...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="shadow-soft">
        <CardContent className="p-6">
          <div className="text-center text-red-600">
            <p>{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (tenants.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="No tenant sites"
        description="You don't have access to any tenant sites yet."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Tenant Sites</h1>
          <p className="text-gray-600">Manage and preview your tenant websites</p>
        </div>
      </div>

      <Tabs defaultValue="sites" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="sites" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Sites
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sites" className="mt-6">
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
            {tenants.map((tenant) => (
              <Card key={tenant.id} className="shadow-soft w-full">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-lg truncate">{tenant.name}</CardTitle>
                      <p className="text-sm text-gray-600 mt-1">Slug: {tenant.slug}</p>
                    </div>
                    <Badge variant={tenant.site?.status === 'published' ? 'default' : 'secondary'} className="shrink-0">
                      {tenant.site?.status || 'No site'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {tenant.branding?.app_name && (
                    <div className="text-sm">
                      <span className="font-medium">App Name:</span> {tenant.branding.app_name}
                    </div>
                  )}
                  
                  {tenant.site ? (
                    <div className="space-y-3">
                      <div className="flex flex-col sm:flex-row gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(`http://${tenant.slug}.localhost:3002/`, '_blank')}
                          className="flex items-center gap-2 flex-1 sm:flex-none"
                        >
                          <Globe className="h-4 w-4" />
                          Live Site
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(`http://${tenant.slug}.localhost:3002/?preview=1`, '_blank')}
                          className="flex items-center gap-2 flex-1 sm:flex-none"
                        >
                          <Eye className="h-4 w-4" />
                          Preview
                        </Button>
                      </div>
                      
                      {tenant.site.status === 'draft' && (
                        <p className="text-xs text-amber-600">
                          Site is in draft mode. Use preview link to view.
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">
                      No site configured yet
                    </div>
                  )}

                  {/* Widget Embed Card */}
                  <WidgetEmbedCard slug={tenant.slug} />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-6">
          {tenants.length > 0 ? (
            <div className="space-y-6">
              {tenants.map((tenant) => (
                <Card key={tenant.id} className="shadow-soft">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="h-5 w-5" />
                      Contact Settings - {tenant.name}
                    </CardTitle>
                    <p className="text-sm text-gray-600">
                      Configure contact information, business details, and social media links for {tenant.name}.
                    </p>
                  </CardHeader>
                  <CardContent>
                    <ContactSettingsForm tenantId={tenant.id} />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Settings}
              title="No tenants available"
              description="You need to have access to at least one tenant to configure settings."
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

