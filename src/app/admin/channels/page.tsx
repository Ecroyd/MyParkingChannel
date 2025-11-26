"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useTenant } from "@/hooks/useTenant";
import { saveHolidayExtrasSettings } from "./save";
import { Loader2, Save, Eye, EyeOff } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function ChannelsPage() {
  const { tenantId, loading: tenantLoading } = useTenant();
  const [apiKey, setApiKey] = useState("");
  const [abtaNumber, setAbtaNumber] = useState("");
  const [password, setPassword] = useState("");
  const [initials, setInitials] = useState("");
  const [environment, setEnvironment] = useState<"sandbox" | "live">("sandbox");
  const [system, setSystem] = useState("ABC");
  const [lang, setLang] = useState("en");
  const [showApiKey, setShowApiKey] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
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
      const res = await fetch(`/api/admin/channels/holiday-extras?tenantId=${tenantId}`);
      const json = await res.json();
      if (json.success && json.data) {
        setAbtaNumber(json.data.abtaNumber || "");
        setInitials(json.data.initials || "");
        setEnvironment(json.data.environment || "sandbox");
        setSystem(json.data.system || "ABC");
        setLang(json.data.lang || "en");
        // Don't load sensitive fields (apiKey, password) for security
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

    if (!apiKey || !abtaNumber) {
      toast({
        title: "Error",
        description: "API Key and ABTA Number are required",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("tenantId", tenantId);
      formData.append("apiKey", apiKey);
      formData.append("abtaNumber", abtaNumber);
      if (password) formData.append("password", password);
      if (initials) formData.append("initials", initials);
      formData.append("environment", environment);
      formData.append("system", system);
      formData.append("lang", lang);

      await saveHolidayExtrasSettings(formData);
      toast({
        title: "Success",
        description: "Holiday Extras settings saved successfully",
      });
      setApiKey(""); // Clear sensitive fields after saving
      setPassword("");
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
        <h1 className="text-2xl font-semibold">Channel Management</h1>
        <p className="text-gray-600 mt-1">Configure your channel integrations</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Holiday Extras Configuration</CardTitle>
          <CardDescription>
            Configure your Holiday Extras API credentials and settings
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key *</Label>
              <div className="flex gap-2">
                <Input
                  id="apiKey"
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter API key"
                  required
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
              <p className="text-xs text-gray-500">Your Holiday Extras API key</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="abtaNumber">ABTA Number *</Label>
              <Input
                id="abtaNumber"
                value={abtaNumber}
                onChange={(e) => setAbtaNumber(e.target.value)}
                placeholder="Enter ABTA number"
                required
              />
              <p className="text-xs text-gray-500">Your ABTA registration number</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="flex gap-2">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password (optional)"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
              <p className="text-xs text-gray-500">Password for your Holiday Extras account (optional)</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="initials">Initials</Label>
              <Input
                id="initials"
                value={initials}
                onChange={(e) => setInitials(e.target.value)}
                placeholder="e.g. T"
                maxLength={10}
              />
              <p className="text-xs text-gray-500">Your initials (optional)</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="environment">Environment</Label>
              <Select value={environment} onValueChange={(v: "sandbox" | "live") => setEnvironment(v)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sandbox">Sandbox</SelectItem>
                  <SelectItem value="live">Live</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">Use sandbox for testing, live for production</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="system">System</Label>
              <Select value={system} onValueChange={setSystem}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ABC">ABC (UK)</SelectItem>
                  <SelectItem value="ABG">ABG (EU)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">System code: ABC for UK, ABG for EU</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="lang">Language</Label>
              <Select value={lang} onValueChange={setLang}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="de">German</SelectItem>
                  <SelectItem value="fr">French</SelectItem>
                  <SelectItem value="es">Spanish</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">Language code for API responses</p>
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

