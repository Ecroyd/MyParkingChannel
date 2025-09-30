'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import EmptyState from '@/components/admin/EmptyState';
import WidgetEmbedCard from '@/components/admin/WidgetEmbedCard';
import ContactSettingsForm from '@/components/admin/ContactSettingsForm';
import { ExternalLink, Eye, Globe, Building2, Settings } from 'lucide-react';
import { siteUrlForTenantSlug } from '@/lib/sites/domain';

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

type TenantWithSite = Tenant & {
  site?: Site;
  branding?: {
    app_name: string | null;
    theme_color: string | null;
  };
};

interface TenantSitesServerClientProps {
  user: any;
  tenants: TenantWithSite[];
}

export default function TenantSitesServerClient({ user, tenants }: TenantSitesServerClientProps) {
  if (tenants.length === 0) {
    return (
      <EmptyState
        title="No tenant sites"
        detail="You don't have access to any tenant sites yet."
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
                          onClick={() => window.open('/this-should-404', '_blank')}
                          className="flex items-center gap-2 flex-1 sm:flex-none"
                        >
                          <Globe className="h-4 w-4" />
                          Live Site (404 Test)
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

