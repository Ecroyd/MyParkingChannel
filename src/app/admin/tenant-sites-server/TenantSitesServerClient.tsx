'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import EmptyState from '@/components/admin/EmptyState';
import WidgetEmbedCard from '@/components/admin/WidgetEmbedCard';
import ContactSettingsForm from '@/components/admin/ContactSettingsForm';
import { ExternalLink, Eye, Globe, Building2, Settings, Plus, Trash2, Star } from 'lucide-react';
import { siteUrlForTenantSlug } from '@/lib/sites/domain';
import { createClient } from '@/lib/supabase/client';

type Tenant = {
  id: string;
  slug: string;
  name: string;
  timezone: string | null;
  default_capacity?: number;
  role?: string;
  is_default?: boolean;
};

type Site = {
  id: string;
  tenant_id: string;
  slug: string;
  status: 'draft' | 'published';
  template: string;
  primary_domain: string | null;
};

type Domain = {
  id: string;
  domain: string;
  is_primary: boolean;
  verified: boolean;
};

type TenantWithSite = Tenant & {
  site?: Site;
  branding?: {
    app_name: string | null;
    theme_color: string | null;
  };
  domains?: Domain[];
};

interface TenantSitesServerClientProps {
  user: any;
  tenants: TenantWithSite[];
}

export default function TenantSitesServerClient({ user, tenants }: TenantSitesServerClientProps) {
  const [tenantDomains, setTenantDomains] = useState<Record<string, Domain[]>>({});
  const [newDomain, setNewDomain] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});
  const [domainsLoaded, setDomainsLoaded] = useState(false);
  const { toast } = useToast();
  const supabase = createClient();

  // Load domains for each tenant
  useEffect(() => {
    if (!tenants || tenants.length === 0) return;
    
    const loadDomains = async () => {
      try {
        const domainsData: Record<string, Domain[]> = {};
        
        for (const tenant of tenants) {
          if (!tenant?.id) continue;
          
          const { data, error } = await supabase
            .from('tenant_domains')
            .select('id, domain, is_primary, verified')
            .eq('tenant_id', tenant.id);
          
          if (!error && data) {
            domainsData[tenant.id] = data;
          }
        }
        
        setTenantDomains(domainsData);
        setDomainsLoaded(true);
      } catch (error) {
        console.error('Error loading domains:', error);
        setDomainsLoaded(true);
      }
    };

    loadDomains();
  }, [tenants, supabase]);

  const handleAddDomain = async (tenantId: string) => {
    if (!tenantId) return;
    
    const domain = newDomain[tenantId]?.trim();
    if (!domain) return;

    setLoading(prev => ({ ...prev, [tenantId]: true }));

    try {
      const { data, error } = await supabase
        .from('tenant_domains')
        .insert({
          tenant_id: tenantId,
          domain,
          is_primary: false,
          verified: true
        })
        .select()
        .single();

      if (error) throw error;

      setTenantDomains(prev => ({
        ...prev,
        [tenantId]: [...(prev[tenantId] || []), data]
      }));

      setNewDomain(prev => ({ ...prev, [tenantId]: '' }));
      
      toast({
        title: 'Success',
        description: `Domain ${domain} added successfully.`
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to add domain.',
        variant: 'destructive'
      });
    } finally {
      setLoading(prev => ({ ...prev, [tenantId]: false }));
    }
  };

  const handleSetPrimary = async (tenantId: string, domainId: string) => {
    if (!tenantId || !domainId) return;
    
    try {
      // First, unset all primary domains for this tenant
      await supabase
        .from('tenant_domains')
        .update({ is_primary: false })
        .eq('tenant_id', tenantId);

      // Then set the selected domain as primary
      const { error } = await supabase
        .from('tenant_domains')
        .update({ is_primary: true })
        .eq('id', domainId);

      if (error) throw error;

      // Update local state
      setTenantDomains(prev => ({
        ...prev,
        [tenantId]: (prev[tenantId] || []).map(domain => ({
          ...domain,
          is_primary: domain.id === domainId
        }))
      }));

      toast({
        title: 'Success',
        description: 'Primary domain updated successfully.'
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update primary domain.',
        variant: 'destructive'
      });
    }
  };

  const handleDeleteDomain = async (tenantId: string, domainId: string) => {
    if (!tenantId || !domainId) return;
    
    try {
      const { error } = await supabase
        .from('tenant_domains')
        .delete()
        .eq('id', domainId);

      if (error) throw error;

      setTenantDomains(prev => ({
        ...prev,
        [tenantId]: (prev[tenantId] || []).filter(domain => domain.id !== domainId)
      }));

      toast({
        title: 'Success',
        description: 'Domain deleted successfully.'
      });
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete domain.',
        variant: 'destructive'
      });
    }
  };

  const getPrimaryDomain = (tenantId: string) => {
    if (!tenantId) return null;
    
    const domains = tenantDomains[tenantId] || [];
    const primary = domains.find(d => d.is_primary);
    return primary?.domain || null;
  };

  const getLiveSiteUrl = (tenant: TenantWithSite) => {
    if (!tenant?.id || !tenant?.slug) return '#';
    
    const primaryDomain = getPrimaryDomain(tenant.id);
    if (primaryDomain) {
      return `https://${primaryDomain}`;
    }
    return siteUrlForTenantSlug(tenant.slug);
  };

  if (tenants.length === 0) {
    return (
      <EmptyState
        title="No tenant sites"
        detail="You don't have access to any tenant sites yet."
      />
    );
  }

  // Show loading state while domains are being loaded or if tenants data is not ready
  if (!domainsLoaded || !tenants || tenants.some(tenant => !tenant?.id)) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Tenant Sites</h1>
            <p className="text-gray-600">Loading domain information...</p>
          </div>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
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
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="sites" className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Sites
          </TabsTrigger>
          <TabsTrigger value="domains" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Domains
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sites" className="mt-6">
          <div className="grid gap-6 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
            {tenants.filter(tenant => tenant?.id).map((tenant) => (
              <Card key={tenant.id} className="shadow-soft w-full">
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <CardTitle className="text-lg truncate">{tenant.name}</CardTitle>
                      <p className="text-sm text-gray-600 mt-1">Slug: {tenant.slug}</p>
                      {tenant.is_default && (
                        <Badge variant="outline" className="mt-1 text-xs">
                          Default
                        </Badge>
                      )}
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
                          onClick={() => window.open(getLiveSiteUrl(tenant), '_blank')}
                          className="flex items-center gap-2 flex-1 sm:flex-none"
                        >
                          <Globe className="h-4 w-4" />
                          Live Site
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => window.open(siteUrlForTenantSlug(tenant.slug, '/?preview=1'), '_blank')}
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

        <TabsContent value="domains" className="mt-6">
          <div className="space-y-6">
            {tenants.filter(tenant => tenant?.id).map((tenant) => (
              <Card key={tenant.id} className="shadow-soft">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Domains - {tenant.name}
                  </CardTitle>
                  <p className="text-sm text-gray-600">
                    Manage custom domains for {tenant.name}. The primary domain will be used for the "Live Site" button.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Current domains */}
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Current Domains</h4>
                    {tenantDomains[tenant.id]?.length > 0 ? (
                      <div className="space-y-2">
                        {tenantDomains[tenant.id].map((domain) => (
                          <div key={domain.id} className="flex items-center justify-between border rounded-lg p-3">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{domain.domain}</span>
                              {domain.is_primary && (
                                <Badge variant="default" className="text-xs">
                                  <Star className="h-3 w-3 mr-1" />
                                  Primary
                                </Badge>
                              )}
                              {domain.verified && (
                                <Badge variant="outline" className="text-xs">
                                  Verified
                                </Badge>
                              )}
                            </div>
                            <div className="flex gap-2">
                              {!domain.is_primary && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleSetPrimary(tenant.id, domain.id)}
                                >
                                  Set Primary
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDeleteDomain(tenant.id, domain.id)}
                                className="text-red-600 hover:text-red-700"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No custom domains configured</p>
                    )}
                  </div>

                  {/* Add new domain */}
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Add New Domain</h4>
                    <div className="flex gap-2">
                      <Input
                        placeholder="e.g. mybrand.com"
                        value={newDomain[tenant.id] || ''}
                        onChange={(e) => setNewDomain(prev => ({ ...prev, [tenant.id]: e.target.value }))}
                        className="flex-1"
                      />
                      <Button
                        onClick={() => handleAddDomain(tenant.id)}
                        disabled={loading[tenant.id] || !newDomain[tenant.id]?.trim()}
                        className="flex items-center gap-2"
                      >
                        <Plus className="h-4 w-4" />
                        {loading[tenant.id] ? 'Adding...' : 'Add'}
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500">
                      Ensure the domain is configured in your DNS and Vercel before adding it here.
                    </p>
                  </div>
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
              title="No tenants available"
              detail="You need to have access to at least one tenant to configure settings."
            />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

