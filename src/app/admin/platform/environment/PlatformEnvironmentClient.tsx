"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

type EnvStatus = Record<string, boolean> | null;

export default function PlatformEnvironmentClient() {
  const [status, setStatus] = useState<EnvStatus>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/platform/env-status")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load");
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setStatus(data);
      })
      .catch(() => {
        if (!cancelled) setStatus({});
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const vars = [
    { key: "SUPABASE_SERVICE_ROLE_KEY", label: "Supabase service role key", required: true },
    { key: "NEXT_PUBLIC_SUPABASE_URL", label: "Supabase URL", required: true },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Environment</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Platform-level environment variables. Set these in Vercel (or .env.local for local dev). Do not commit secrets.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Required variables</CardTitle>
          <CardDescription>
            These are read from the server environment. Configure them in your deployment (e.g. Vercel → Project → Settings → Environment Variables).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : status ? (
            <ul className="space-y-3">
              {vars.map(({ key, label, required }) => {
                const set = status[key] === true;
                return (
                  <li key={key} className="flex items-center justify-between gap-4 py-2 border-b border-gray-100 last:border-0">
                    <div>
                      <span className="font-mono text-sm font-medium">{key}</span>
                      <span className="text-muted-foreground text-sm ml-2">{label}</span>
                      {required && (
                        <span className="text-xs text-amber-600 ml-2">required</span>
                      )}
                    </div>
                    {set ? (
                      <span className="inline-flex items-center gap-1 text-sm text-green-700">
                        <CheckCircle2 className="h-4 w-4" />
                        Set
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-sm text-red-600">
                        <XCircle className="h-4 w-4" />
                        Not set
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-red-600">Could not load env status.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
