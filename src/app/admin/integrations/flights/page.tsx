"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTenant } from "@/hooks/useTenant";
import {
  upsertFlightProvider,
  setAirlineOverride,
  saveAviationstackKey,
} from "./actions";
import { Loader2, Save, Eye, EyeOff, Plane, CheckCircle2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function FlightsIntegrationPage() {
  const { tenantId, loading: tenantLoading } = useTenant();
  const [loading, setLoading] = useState(true);
  const [hasAviationstack, setHasAviationstack] = useState(false);
  const [hasAeroDataBox, setHasAeroDataBox] = useState(false);

  // Aviationstack
  const [avApiKey, setAvApiKey] = useState("");
  const [showAvApiKey, setShowAvApiKey] = useState(false);
  const [savingAv, setSavingAv] = useState(false);

  // AeroDataBox
  const [adBaseUrl, setAdBaseUrl] = useState(
    "https://aerodatabox.p.rapidapi.com"
  );
  const [adApiKey, setAdApiKey] = useState("");
  const [showAdApiKey, setShowAdApiKey] = useState(false);
  const [adMode, setAdMode] = useState<"rapidapi" | "direct">("rapidapi");
  const [adHost, setAdHost] = useState("aerodatabox.p.rapidapi.com");
  const [savingAd, setSavingAd] = useState(false);

  // Test lookup
  const [testFlightNumber, setTestFlightNumber] = useState("");
  const [testFlightDate, setTestFlightDate] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  // Airline overrides
  const [savingOverrides, setSavingOverrides] = useState(false);

  useEffect(() => {
    if (tenantId) {
      loadSettings();
    }
  }, [tenantId]);

  async function loadSettings() {
    if (!tenantId) return;
    try {
      const res = await fetch(
        `/api/admin/integrations/flights?tenantId=${tenantId}`
      );
      const json = await res.json();
      if (json.success) {
        setHasAviationstack(json.hasAviationstack || false);
        setHasAeroDataBox(json.hasAeroDataBox || false);
      }
    } catch (err) {
      console.error("Failed to load settings:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveAviationstack(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId || !avApiKey) {
      toast({
        title: "Error",
        description: "Tenant ID and API key are required",
        variant: "destructive",
      });
      return;
    }

    setSavingAv(true);
    try {
      await saveAviationstackKey(tenantId, avApiKey);
      toast({
        title: "Success",
        description: "Aviationstack API key saved successfully",
      });
      setAvApiKey("");
      await loadSettings();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to save API key",
        variant: "destructive",
      });
    } finally {
      setSavingAv(false);
    }
  }

  async function handleSaveAeroDataBox(e: React.FormEvent) {
    e.preventDefault();
    if (!tenantId || !adApiKey) {
      toast({
        title: "Error",
        description: "Tenant ID and API key are required",
        variant: "destructive",
      });
      return;
    }

    setSavingAd(true);
    try {
      await upsertFlightProvider({
        tenantId,
        providerName: "aerodatabox",
        baseUrl: adBaseUrl,
        apiKey: adApiKey,
        priority: 60,
        metadata: {
          mode: adMode,
          rapidapiHost: adHost,
        },
      });
      toast({
        title: "Success",
        description: "AeroDataBox API key saved successfully",
      });
      setAdApiKey("");
      setTestResult(null); // Clear test result
      // Refresh status to show API key is now configured
      await loadSettings();
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to save API key",
        variant: "destructive",
      });
    } finally {
      setSavingAd(false);
    }
  }

  async function handleSeedOverrides() {
    if (!tenantId) {
      toast({
        title: "Error",
        description: "Tenant ID not found",
        variant: "destructive",
      });
      return;
    }

    setSavingOverrides(true);
    try {
      // Route low-cost carriers to AeroDataBox first
      await setAirlineOverride(tenantId, "FR", "aerodatabox", 1); // Ryanair
      await setAirlineOverride(tenantId, "LM", "aerodatabox", 1); // Loganair
      await setAirlineOverride(tenantId, "SI", "aerodatabox", 1); // Blue Islands
      toast({
        title: "Success",
        description: "Airline overrides saved (FR/LM/SI → AeroDataBox first)",
      });
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to save overrides",
        variant: "destructive",
      });
    } finally {
      setSavingOverrides(false);
    }
  }

  async function handleTestLookup() {
    if (!tenantId || !testFlightNumber) {
      toast({
        title: "Error",
        description: "Tenant ID and flight number are required",
        variant: "destructive",
      });
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("/api/flights/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId,
          flightNumber: testFlightNumber,
          flightDate: testFlightDate || undefined,
        }),
      });

      const json = await res.json();
      if (json.error || !json.ok) {
        toast({
          title: "Test Failed",
          description: json.error || "Flight not found",
          variant: "destructive",
        });
        setTestResult({ error: json.error || "Flight not found" });
      } else {
        toast({
          title: "Test Success",
          description: `Flight found (source: ${json.source})`,
        });
        setTestResult(json);
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to test lookup",
        variant: "destructive",
      });
      setTestResult({ error: err.message });
    } finally {
      setTesting(false);
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
        <h1 className="text-2xl font-semibold">Flight Data Providers</h1>
        <p className="text-gray-600 mt-1">
          Configure multiple flight data providers for better coverage. Low-cost
          carriers (FR, LM, SI) can be routed to AeroDataBox first.
        </p>
      </div>

      {/* Aviationstack */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plane className="h-5 w-5" />
            Aviationstack
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasAviationstack && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-900">
                  API Key Configured
                </p>
                <p className="text-xs text-green-700">
                  Aviationstack is active for this tenant.
                </p>
              </div>
            </div>
          )}
          <form onSubmit={handleSaveAviationstack} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="avApiKey">Aviationstack API Key</Label>
              <div className="flex gap-2">
                <Input
                  id="avApiKey"
                  type={showAvApiKey ? "text" : "password"}
                  value={avApiKey}
                  onChange={(e) => setAvApiKey(e.target.value)}
                  placeholder="Enter your Aviationstack API key"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowAvApiKey(!showAvApiKey)}
                >
                  {showAvApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                Priority: 50 (tried after airline overrides)
              </p>
            </div>
            <Button type="submit" disabled={savingAv} className="w-full">
              {savingAv ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {hasAviationstack ? "Update API Key" : "Save API Key"}
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* AeroDataBox */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plane className="h-5 w-5" />
            AeroDataBox
          </CardTitle>
        </CardHeader>
        <CardContent>
          {hasAeroDataBox && (
            <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-green-900">
                  API Key Configured
                </p>
                <p className="text-xs text-green-700">
                  AeroDataBox is active for this tenant.
                </p>
              </div>
            </div>
          )}
          <form onSubmit={handleSaveAeroDataBox} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="adMode">API Mode</Label>
              <select
                id="adMode"
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
                value={adMode}
                onChange={(e) =>
                  setAdMode(e.target.value as "rapidapi" | "direct")
                }
              >
                <option value="rapidapi">RapidAPI</option>
                <option value="direct">Direct</option>
              </select>
              <p className="text-xs text-gray-500">
                Use RapidAPI (default) or direct API. RapidAPI requires Host +
                Key headers.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="adBaseUrl">Base URL</Label>
              <Input
                id="adBaseUrl"
                value={adBaseUrl}
                onChange={(e) => setAdBaseUrl(e.target.value)}
                placeholder="https://aerodatabox.p.rapidapi.com"
              />
            </div>
            {adMode === "rapidapi" && (
              <div className="space-y-2">
                <Label htmlFor="adHost">RapidAPI Host</Label>
                <Input
                  id="adHost"
                  value={adHost}
                  onChange={(e) => setAdHost(e.target.value)}
                  placeholder="aerodatabox.p.rapidapi.com"
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="adApiKey">API Key</Label>
              <div className="flex gap-2">
                <Input
                  id="adApiKey"
                  type={showAdApiKey ? "text" : "password"}
                  value={adApiKey}
                  onChange={(e) => setAdApiKey(e.target.value)}
                  placeholder="Enter your AeroDataBox API key"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowAdApiKey(!showAdApiKey)}
                >
                  {showAdApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                Priority: 60 (tried after Aviationstack)
              </p>
            </div>
            <Button type="submit" disabled={savingAd} className="w-full">
              {savingAd ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  {hasAeroDataBox ? "Update API Key" : "Save API Key"}
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Airline Overrides */}
      <Card>
        <CardHeader>
          <CardTitle>Airline Overrides</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            Route specific airlines to preferred providers. Low-cost carriers
            (FR, LM, SI) typically have better coverage in AeroDataBox.
          </p>
          <Button
            onClick={handleSeedOverrides}
            disabled={savingOverrides || !tenantId}
            className="w-full"
          >
            {savingOverrides ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Seed FR / LM / SI → AeroDataBox"
            )}
          </Button>
          <p className="text-xs text-gray-500">
            This will set Ryanair (FR), Loganair (LM), and Blue Islands (SI) to
            use AeroDataBox first.
          </p>
        </CardContent>
      </Card>

      {/* Test Flight Lookup */}
      <Card>
        <CardHeader>
          <CardTitle>Test Flight Lookup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="testFlightNumber">Flight Number</Label>
            <Input
              id="testFlightNumber"
              value={testFlightNumber}
              onChange={(e) => setTestFlightNumber(e.target.value.toUpperCase())}
              placeholder="e.g. BA123 or FR6421"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="testFlightDate">Flight Date (optional)</Label>
            <Input
              id="testFlightDate"
              type="date"
              value={testFlightDate}
              onChange={(e) => setTestFlightDate(e.target.value)}
            />
            <p className="text-xs text-gray-500">
              Leave empty to use today's date
            </p>
          </div>
          <Button
            onClick={handleTestLookup}
            disabled={testing || !testFlightNumber || !tenantId}
            className="w-full"
          >
            {testing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testing...
              </>
            ) : (
              "Test Lookup"
            )}
          </Button>
          {testResult && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <h3 className="font-semibold mb-2">Test Result:</h3>
              {testResult.error ? (
                <p className="text-sm text-red-600">{testResult.error}</p>
              ) : (
                <div className="space-y-2 text-sm">
                  <p>
                    <strong>Source:</strong> {testResult.source}
                  </p>
                  {testResult.flight && (
                    <>
                      <p>
                        <strong>Flight:</strong> {testResult.flight.flight_number}
                      </p>
                      <p>
                        <strong>Date:</strong> {testResult.flight.flight_date}
                      </p>
                      <p>
                        <strong>Status:</strong> {testResult.flight.status || "N/A"}
                      </p>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
