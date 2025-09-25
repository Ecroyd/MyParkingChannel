'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Save, Eye, EyeOff, Mail, Car, AlertCircle, CheckCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { INTEGRATION_PROVIDERS } from '@/lib/constants';

interface Integration {
  id: string;
  provider: string;
  config: Record<string, any>;
  created_at: string;
  updated_at: string;
}

interface IntegrationFormData {
  provider: string;
  config: Record<string, any>;
}

export default function IntegrationsClient() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [showSecrets, setShowSecrets] = useState<Record<string, boolean>>({});
  
  // Load integrations on mount
  useEffect(() => {
    loadIntegrations();
  }, []);
  
  const loadIntegrations = async () => {
    try {
      const response = await fetch('/api/admin/integrations');
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to load integrations');
      }
      
      setIntegrations(data.integrations || []);
    } catch (error: any) {
      console.error('Error loading integrations:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to load integrations',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };
  
  const saveIntegration = async (provider: string, config: Record<string, any>) => {
    setSaving(provider);
    
    try {
      const response = await fetch('/api/admin/integrations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          provider,
          config,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to save integration');
      }
      
      toast({
        title: 'Success',
        description: data.message,
      });
      
      // Reload integrations
      await loadIntegrations();
      
    } catch (error: any) {
      console.error('Error saving integration:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to save integration',
        variant: 'destructive',
      });
    } finally {
      setSaving(null);
    }
  };
  
  const toggleSecretVisibility = (provider: string) => {
    setShowSecrets(prev => ({
      ...prev,
      [provider]: !prev[provider],
    }));
  };
  
  const getIntegrationConfig = (provider: string): Integration | null => {
    return integrations.find(i => i.provider === provider) || null;
  };
  
  const renderEmailProvider = (provider: string, name: string, description: string) => {
    const integration = getIntegrationConfig(provider);
    const isSaving = saving === provider;
    const showSecret = showSecrets[provider] || false;
    
    return (
      <Card key={provider}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            {name}
          </CardTitle>
          <p className="text-sm text-gray-600">{description}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor={`${provider}-apiKey`}>API Key *</Label>
            <div className="flex gap-2">
              <Input
                id={`${provider}-apiKey`}
                type={showSecret ? 'text' : 'password'}
                defaultValue={integration?.config?.apiKey || ''}
                placeholder="Enter your API key"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => toggleSecretVisibility(provider)}
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          
          <div>
            <Label htmlFor={`${provider}-fromEmail`}>From Email *</Label>
            <Input
              id={`${provider}-fromEmail`}
              type="email"
              defaultValue={integration?.config?.fromEmail || ''}
              placeholder="noreply@yourdomain.com"
            />
          </div>
          
          {provider === 'sendgrid' && (
            <div>
              <Label htmlFor={`${provider}-domain`}>Domain (optional)</Label>
              <Input
                id={`${provider}-domain`}
                defaultValue={integration?.config?.domain || ''}
                placeholder="yourdomain.com"
              />
            </div>
          )}
          
          {provider === 'smtp' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor={`${provider}-host`}>SMTP Host</Label>
                  <Input
                    id={`${provider}-host`}
                    defaultValue={integration?.config?.host || ''}
                    placeholder="smtp.gmail.com"
                  />
                </div>
                <div>
                  <Label htmlFor={`${provider}-port`}>Port</Label>
                  <Input
                    id={`${provider}-port`}
                    type="number"
                    defaultValue={integration?.config?.port || 587}
                    placeholder="587"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor={`${provider}-username`}>Username</Label>
                  <Input
                    id={`${provider}-username`}
                    defaultValue={integration?.config?.username || ''}
                    placeholder="your-email@gmail.com"
                  />
                </div>
                <div>
                  <Label htmlFor={`${provider}-password`}>Password</Label>
                  <Input
                    id={`${provider}-password`}
                    type="password"
                    defaultValue={integration?.config?.password || ''}
                    placeholder="App password"
                  />
                </div>
              </div>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id={`${provider}-secure`}
                  defaultChecked={integration?.config?.secure || false}
                />
                <Label htmlFor={`${provider}-secure`}>Use SSL/TLS</Label>
              </div>
            </>
          )}
          
          <Button
            onClick={() => {
              const form = document.getElementById(`${provider}-form`) as HTMLFormElement;
              if (form) {
                const formData = new FormData(form);
                const config: Record<string, any> = {};
                
                for (const [key, value] of formData.entries()) {
                  if (value) {
                    config[key] = value;
                  }
                }
                
                saveIntegration(provider, config);
              }
            }}
            disabled={isSaving}
            className="w-full"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Configuration
              </>
            )}
          </Button>
          
          {integration && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="h-4 w-4" />
              Last updated: {new Date(integration.updated_at).toLocaleDateString()}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };
  
  const renderParkingProvider = (provider: string, name: string, description: string) => {
    const integration = getIntegrationConfig(provider);
    const isSaving = saving === provider;
    const showSecret = showSecrets[provider] || false;
    
    return (
      <Card key={provider}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Car className="h-5 w-5" />
            {name}
          </CardTitle>
          <p className="text-sm text-gray-600">{description}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor={`${provider}-apiKey`}>API Key *</Label>
            <div className="flex gap-2">
              <Input
                id={`${provider}-apiKey`}
                type={showSecret ? 'text' : 'password'}
                defaultValue={integration?.config?.apiKey || ''}
                placeholder="Enter your API key"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => toggleSecretVisibility(provider)}
              >
                {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          
          <div>
            <Label htmlFor={`${provider}-endpoint`}>Endpoint URL (optional)</Label>
            <Input
              id={`${provider}-endpoint`}
              type="url"
              defaultValue={integration?.config?.endpoint || ''}
              placeholder="https://api.parkvia.com"
            />
          </div>
          
          <Button
            onClick={() => {
              const form = document.getElementById(`${provider}-form`) as HTMLFormElement;
              if (form) {
                const formData = new FormData(form);
                const config: Record<string, any> = {};
                
                for (const [key, value] of formData.entries()) {
                  if (value) {
                    config[key] = value;
                  }
                }
                
                saveIntegration(provider, config);
              }
            }}
            disabled={isSaving}
            className="w-full"
          >
            {isSaving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="mr-2 h-4 w-4" />
                Save Configuration
              </>
            )}
          </Button>
          
          {integration && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="h-4 w-4" />
              Last updated: {new Date(integration.updated_at).toLocaleDateString()}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="ml-2">Loading integrations...</span>
      </div>
    );
  }
  
  return (
    <div className="space-y-8">
      {/* Email Providers */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Email Providers</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {renderEmailProvider(
            INTEGRATION_PROVIDERS.EMAIL.RESEND,
            'Resend',
            'Modern email API for developers'
          )}
          {renderEmailProvider(
            INTEGRATION_PROVIDERS.EMAIL.SENDGRID,
            'SendGrid',
            'Email delivery service'
          )}
          {renderEmailProvider(
            INTEGRATION_PROVIDERS.EMAIL.POSTMARK,
            'Postmark',
            'Transactional email service'
          )}
          {renderEmailProvider(
            INTEGRATION_PROVIDERS.EMAIL.SMTP,
            'SMTP',
            'Custom SMTP server configuration'
          )}
        </div>
      </div>
      
      {/* Parking Providers */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Parking Partners</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {renderParkingProvider(
            INTEGRATION_PROVIDERS.PARKING.PARKVIA,
            'ParkVia',
            'Parking booking platform'
          )}
          {renderParkingProvider(
            INTEGRATION_PROVIDERS.PARKING.HOLIDAYEXTRAS,
            'HolidayExtras',
            'Travel and parking services'
          )}
        </div>
      </div>
      
      {/* Security Notice */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
          <div>
            <h3 className="font-medium text-yellow-800">Security Notice</h3>
            <p className="text-sm text-yellow-700 mt-1">
              API keys and credentials are stored securely in the database. 
              Only platform administrators can view and modify these settings.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
