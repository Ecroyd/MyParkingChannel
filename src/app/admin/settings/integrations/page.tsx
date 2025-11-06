"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTenant } from "@/hooks/useTenant";
import { saveAnprSettings } from "./save";
import { Loader2, Save, Eye, EyeOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function IntegrationsPage() {
  const { tenantId, loading: tenantLoading } = useTenant();
  const [provider, setProvider] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (tenantId) {
      loadSettings();
    }
  }, [tenantId]);

  async function loadSettings() {
    if (!tenantId) return;
    try {
      const res = await fetch(`/api/admin/settings/integrations?tenantId=${tenantId}`);
      const json = await res.json();
      if (json.success && json.data) {
        setProvider(json.data.anpr_provider || "");
        setBaseUrl(json.data.anpr_api_base_url || "");
        setWebhookUrl(json.data.webhook_url || "");
        // Don't load API key for security
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId) {
      toast({
        title: "Error",
        description: "Tenant ID not found",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("tenantId", tenantId);
      formData.append("provider", provider);
      formData.append("baseUrl", baseUrl);
      formData.append("apiKey", apiKey);
      formData.append("webhookUrl", webhookUrl);

      await saveAnprSettings(formData);
      toast({
        title: "Success",
        description: "ANPR settings saved successfully",
      });
      setApiKey(""); // Clear API key after saving
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to save settings",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  if (tenantLoading || loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">ANPR Integration Settings</h1>
        <p className="text-gray-600 mt-1">Configure your ANPR provider and webhook settings</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>ANPR Provider Configuration</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="provider">ANPR Provider</Label>
              <Input
                id="provider"
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                placeholder="e.g. openalpr, plate-recognition, etc."
              />
              <p className="text-xs text-gray-500">Label for your ANPR provider (optional)</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="baseUrl">API Base URL</Label>
              <Input
                id="baseUrl"
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.provider.com"
              />
              <p className="text-xs text-gray-500">Base URL for your ANPR provider API</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key (server-stored)</Label>
              <div className="flex gap-2">
                <Input
                  id="apiKey"
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter API key to update (leave blank to keep existing)"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-gray-500">API key is stored securely on the server</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="webhookUrl">Webhook URL</Label>
              <div className="flex gap-2">
                <Input
                  id="webhookUrl"
                  type="url"
                  value={webhookUrl}
                  readOnly
                  className="bg-gray-50"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    const url = `${window.location.origin}/api/anpr/webhook?tenantId=${tenantId}`;
                    navigator.clipboard.writeText(url);
                    toast({
                      title: "Copied",
                      description: "Webhook URL copied to clipboard",
                    });
                  }}
                >
                  Copy URL
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                Provide this URL to your ANPR vendor to receive events
              </p>
            </div>

            <Button type="submit" disabled={saving} className="w-full">
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save Settings
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

