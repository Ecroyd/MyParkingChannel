/**
 * Platform Integrations Page
 * Allows platform admins to configure SMTP/API keys for various services
 */

import { requirePlatformAdmin } from '@/lib/guards';
import IntegrationsClient from './IntegrationsClient';

export default async function IntegrationsPage() {
  // Require platform admin access
  await requirePlatformAdmin();
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Platform Integrations</h1>
        <p className="text-gray-600 mt-1">Configure API keys and settings for external services</p>
      </div>
      
      <IntegrationsClient />
    </div>
  );
}