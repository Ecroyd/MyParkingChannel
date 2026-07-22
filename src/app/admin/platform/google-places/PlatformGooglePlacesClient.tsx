"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";

type Status = {
  configured: boolean;
  is_enabled: boolean;
  has_env_fallback: boolean;
};

export default function PlatformGooglePlacesClient({
  initial,
}: {
  initial: Status;
}) {
  const [status, setStatus] = useState(initial);
  const [apiKey, setApiKey] = useState("");
  const [enabled, setEnabled] = useState(initial.is_enabled);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/platform/google-places", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: apiKey || undefined,
          is_enabled: enabled,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Save failed");
      }
      setStatus(json.settings);
      setApiKey("");
      toast({ title: "Saved", description: "Google Places settings updated." });
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Save failed",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-xl">
      <CardHeader>
        <CardTitle>Google Places API</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-slate-600">
          Platform key for tenant Google reviews. The key is stored encrypted and is never
          sent to browsers. Tenants only configure their own Place ID in Site SEO.
        </p>
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
          Status:{" "}
          {status.configured ? (
            <span className="font-medium text-emerald-700">Configured</span>
          ) : (
            <span className="font-medium text-amber-700">Not configured</span>
          )}
          {status.has_env_fallback ? " (env fallback present)" : null}
          {" · "}
          {status.is_enabled ? "Enabled" : "Disabled"}
        </div>
        <div className="space-y-2">
          <Label htmlFor="places-key">API key</Label>
          <Input
            id="places-key"
            type="password"
            autoComplete="off"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              status.configured
                ? "Leave blank to keep existing key"
                : "Enter Google Places API key"
            }
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          Enable Google Places for tenant review fetching
        </label>
        <Button type="button" onClick={() => void save()} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </CardContent>
    </Card>
  );
}
