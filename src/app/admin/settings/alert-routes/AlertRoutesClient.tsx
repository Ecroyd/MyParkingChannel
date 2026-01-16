'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Plus, Trash2, Mail, Webhook, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';

type AlertRoute = {
  id: string;
  kind: 'email' | 'webhook';
  destination: string;
  is_enabled: boolean;
  config: any;
  created_at: string;
};

type Alert = {
  id: string;
  supplier_code: string;
  severity: 'error' | 'warning';
  message: string;
  errors: string[] | null;
  sent_at: string | null;
  created_at: string;
};

interface AlertRoutesClientProps {
  initialRoutes: AlertRoute[];
  recentAlerts: Alert[];
  tenantId: string;
}

export default function AlertRoutesClient({ initialRoutes, recentAlerts, tenantId }: AlertRoutesClientProps) {
  const [routes, setRoutes] = useState<AlertRoute[]>(initialRoutes);
  const [alerts] = useState<Alert[]>(recentAlerts);
  const [loading, setLoading] = useState(false);
  const [newRoute, setNewRoute] = useState<{
    kind: 'email' | 'webhook';
    destination: string;
    config: any;
  } | null>(null);

  async function saveRoute(route: Partial<AlertRoute> & { kind: 'email' | 'webhook'; destination: string }) {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/settings/alert-routes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          ...route,
        }),
      });

      const result = await response.json();

      if (!result.ok) {
        throw new Error(result.error || 'Failed to save route');
      }

      toast({
        title: 'Success',
        description: 'Alert route saved successfully',
      });

      // Reload routes
      const routesResponse = await fetch(`/api/admin/settings/alert-routes?tenantId=${tenantId}`);
      const routesData = await routesResponse.json();
      if (routesData.ok) {
        setRoutes(routesData.routes);
      }

      setNewRoute(null);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to save route',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function deleteRoute(routeId: string) {
    if (!confirm('Are you sure you want to delete this alert route?')) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/admin/settings/alert-routes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, routeId }),
      });

      const result = await response.json();

      if (!result.ok) {
        throw new Error(result.error || 'Failed to delete route');
      }

      toast({
        title: 'Success',
        description: 'Alert route deleted',
      });

      setRoutes(routes.filter(r => r.id !== routeId));
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to delete route',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  async function toggleRoute(routeId: string, enabled: boolean) {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/settings/alert-routes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, routeId, is_enabled: enabled }),
      });

      const result = await response.json();

      if (!result.ok) {
        throw new Error(result.error || 'Failed to update route');
      }

      setRoutes(routes.map(r => r.id === routeId ? { ...r, is_enabled: enabled } : r));
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to update route',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Sync Failure Alerts</h1>
        <p className="text-sm text-gray-500">
          Configure where to receive alerts when supplier syncs fail or become stale
        </p>
      </div>

      {/* Add New Route */}
      <Card>
        <CardHeader>
          <CardTitle>Add Alert Route</CardTitle>
        </CardHeader>
        <CardContent>
          {!newRoute ? (
            <div className="flex gap-2">
              <Button
                onClick={() => setNewRoute({ kind: 'email', destination: '', config: { provider: 'resend' } })}
                variant="outline"
              >
                <Mail className="mr-2 h-4 w-4" />
                Add Email
              </Button>
              <Button
                onClick={() => setNewRoute({ kind: 'webhook', destination: '', config: {} })}
                variant="outline"
              >
                <Webhook className="mr-2 h-4 w-4" />
                Add Webhook
              </Button>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (newRoute.destination) {
                  saveRoute(newRoute);
                }
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label>Type</Label>
                <div className="flex items-center gap-2">
                  {newRoute.kind === 'email' ? (
                    <Mail className="h-4 w-4" />
                  ) : (
                    <Webhook className="h-4 w-4" />
                  )}
                  <span className="text-sm font-medium capitalize">{newRoute.kind}</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="destination">
                  {newRoute.kind === 'email' ? 'Email Address' : 'Webhook URL'}
                </Label>
                <Input
                  id="destination"
                  type={newRoute.kind === 'email' ? 'email' : 'url'}
                  value={newRoute.destination}
                  onChange={(e) => setNewRoute({ ...newRoute, destination: e.target.value })}
                  placeholder={newRoute.kind === 'email' ? 'alerts@example.com' : 'https://example.com/webhook'}
                  required
                />
              </div>

              {newRoute.kind === 'email' && (
                <div className="space-y-2">
                  <Label htmlFor="provider">Email Provider</Label>
                  <select
                    id="provider"
                    value={newRoute.config?.provider || 'resend'}
                    onChange={(e) => setNewRoute({ ...newRoute, config: { ...newRoute.config, provider: e.target.value } })}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    <option value="resend">Resend</option>
                    <option value="sendgrid">SendGrid</option>
                    <option value="postmark">Postmark</option>
                    <option value="smtp">SMTP</option>
                  </select>
                  <p className="text-xs text-gray-500">
                    Configure API keys in tenant secrets (scope: alerting or email)
                  </p>
                </div>
              )}

              {newRoute.kind === 'webhook' && (
                <div className="space-y-2">
                  <Label htmlFor="authHeader">Authorization Header (optional)</Label>
                  <Input
                    id="authHeader"
                    type="text"
                    value={newRoute.config?.auth_header || ''}
                    onChange={(e) => setNewRoute({ ...newRoute, config: { ...newRoute.config, auth_header: e.target.value } })}
                    placeholder="Bearer token123 or Basic base64..."
                  />
                </div>
              )}

              <div className="flex gap-2">
                <Button type="submit" disabled={loading || !newRoute.destination}>
                  {loading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Plus className="mr-2 h-4 w-4" />
                      Save Route
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setNewRoute(null)}
                  disabled={loading}
                >
                  Cancel
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Existing Routes */}
      <Card>
        <CardHeader>
          <CardTitle>Alert Routes</CardTitle>
        </CardHeader>
        <CardContent>
          {routes.length === 0 ? (
            <p className="text-sm text-gray-500">No alert routes configured</p>
          ) : (
            <div className="space-y-4">
              {routes.map((route) => (
                <div
                  key={route.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      {route.kind === 'email' ? (
                        <Mail className="h-4 w-4 text-gray-500" />
                      ) : (
                        <Webhook className="h-4 w-4 text-gray-500" />
                      )}
                      <span className="font-medium">{route.destination}</span>
                      <Badge variant={route.is_enabled ? 'default' : 'secondary'}>
                        {route.is_enabled ? 'Enabled' : 'Disabled'}
                      </Badge>
                    </div>
                    {route.config?.provider && (
                      <p className="text-xs text-gray-500 mt-1">
                        Provider: {route.config.provider}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={route.is_enabled}
                      onCheckedChange={(enabled) => toggleRoute(route.id, enabled)}
                      disabled={loading}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteRoute(route.id)}
                      disabled={loading}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Alerts */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Alerts</CardTitle>
        </CardHeader>
        <CardContent>
          {alerts.length === 0 ? (
            <p className="text-sm text-gray-500">No alerts yet</p>
          ) : (
            <div className="space-y-2">
              {alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="flex items-start gap-3 p-3 border rounded-lg"
                >
                  <div className="mt-0.5">
                    {alert.severity === 'error' ? (
                      <XCircle className="h-5 w-5 text-red-500" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-yellow-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={alert.severity === 'error' ? 'destructive' : 'secondary'}>
                        {alert.supplier_code.toUpperCase()}
                      </Badge>
                      <Badge variant="outline">{alert.severity}</Badge>
                      {alert.sent_at && (
                        <CheckCircle2 className="h-4 w-4 text-green-500" title="Sent" />
                      )}
                    </div>
                    <p className="text-sm mt-1">{alert.message}</p>
                    {alert.errors && alert.errors.length > 0 && (
                      <details className="mt-2">
                        <summary className="text-xs text-gray-500 cursor-pointer">
                          {alert.errors.length} error(s)
                        </summary>
                        <ul className="mt-1 text-xs text-gray-600 list-disc list-inside">
                          {alert.errors.slice(0, 3).map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                          {alert.errors.length > 3 && (
                            <li>... and {alert.errors.length - 3} more</li>
                          )}
                        </ul>
                      </details>
                    )}
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(alert.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
