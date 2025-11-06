"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useTenant } from "@/hooks/useTenant";
import { saveAviationstackKey } from "./actions";
import { Loader2, Save, Eye, EyeOff, Plane } from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function FlightsIntegrationPage() {
  const { tenantId, loading: tenantLoading } = useTenant();
  const [apiKey, setApiKey] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [testFlightNumber, setTestFlightNumber] = useState("");
  const [testFlightDate, setTestFlightDate] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  useEffect(() => {
    if (tenantId) {
      loadSettings();
    }
  }, [tenantId]);

  async function loadSettings() {
    if (!tenantId) return;
    try {
      // Check if provider exists (we don't load the key for security)
      const res = await fetch(
        `/api/admin/integrations/flights?tenantId=${tenantId}`
      );
      const json = await res.json();
      if (json.success && json.hasProvider) {
        // Provider exists, but we don't show the key
        setApiKey(""); // Clear field
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

    if (!apiKey) {
      toast({
        title: "Error",
        description: "API key is required",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      await saveAviationstackKey(tenantId, apiKey);
      toast({
        title: "Success",
        description: "Aviationstack API key saved successfully",
      });
      setApiKey(""); // Clear after saving
      setTestResult(null); // Clear test result
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to save API key",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
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
      if (json.error) {
        toast({
          title: "Test Failed",
          description: json.error,
          variant: "destructive",
        });
        setTestResult({ error: json.error });
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
        <h1 className="text-2xl font-semibold">Flight Data Integration</h1>
        <p className="text-gray-600 mt-1">
          Configure Aviationstack API key for flight status lookups. Results are
          cached to control costs.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plane className="h-5 w-5" />
            Aviationstack Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="apiKey">Aviationstack API Key</Label>
              <div className="flex gap-2">
                <Input
                  id="apiKey"
                  type={showApiKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Enter your Aviationstack API key"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  onClick={() => setShowApiKey(!showApiKey)}
                >
                  {showApiKey ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-gray-500">
                API key is stored securely on the server
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
                  Save API Key
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Test Flight Lookup Widget */}
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
              placeholder="e.g. BA123"
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
                      {testResult.flight.scheduled_departure && (
                        <p>
                          <strong>Scheduled Departure:</strong>{" "}
                          {new Date(
                            testResult.flight.scheduled_departure
                          ).toLocaleString()}
                        </p>
                      )}
                      {testResult.flight.scheduled_arrival && (
                        <p>
                          <strong>Scheduled Arrival:</strong>{" "}
                          {new Date(
                            testResult.flight.scheduled_arrival
                          ).toLocaleString()}
                        </p>
                      )}
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

