"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  Globe,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { UploadTenantLogo } from "@/components/admin/UploadTenantLogo";
import { CONTENT_BLOCK_TYPES } from "@/lib/seo/content-blocks";
import { previewRedirectChain } from "@/lib/seo/redirects";
import { pageHealthWarnings } from "@/lib/seo/health";

type Bundle = {
  context: {
    tenantId: string;
    tenantSlug: string;
    tenantName: string;
    siteId: string;
    primaryDomain: string | null;
    indexingState: string;
    lastPublishedAt: string | null;
    previewUrl: string;
  };
  settings: Record<string, unknown> | null;
  pages: Array<Record<string, unknown>>;
  redirects: Array<Record<string, unknown>>;
  domains: Array<Record<string, unknown>>;
  profile: Record<string, unknown> | null;
  health: {
    critical: number;
    recommended: number;
    checks: Array<{
      id: string;
      severity: string;
      title: string;
      detail: string;
      pagePath?: string;
      fixHint?: string;
    }>;
  };
};

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
    </div>
  );
}

export default function SiteSeoAdminPage() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [profile, setProfile] = useState<Record<string, unknown>>({});
  const [pages, setPages] = useState<Array<Record<string, unknown>>>([]);
  const [redirects, setRedirects] = useState<Array<Record<string, unknown>>>([]);
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");
  const [newRedirect, setNewRedirect] = useState({
    old_path: "",
    new_path: "",
    status_code: 301,
  });
  const [chainPreviewPath, setChainPreviewPath] = useState("/");
  const [csvText, setCsvText] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/site-seo/bundle");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setBundle(json);
      setSettings(json.settings || {});
      setProfile(json.profile || {});
      setPages(json.pages || []);
      setRedirects(json.redirects || []);
      if (!selectedPageId && json.pages?.[0]?.id) {
        setSelectedPageId(json.pages[0].id);
      }
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to load SEO data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [selectedPageId, toast]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedPage = useMemo(
    () => pages.find((p) => p.id === selectedPageId) ?? null,
    [pages, selectedPageId]
  );

  const address = (profile.address as Record<string, string>) || {};

  async function saveSettings() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/site-seo/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      toast({ title: "Saved", description: "Site defaults updated." });
      await load();
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Save failed",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/site-seo/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      toast({ title: "Saved", description: "Local business profile updated." });
      await load();
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Save failed",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function savePage(page: Record<string, unknown>) {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/site-seo/pages", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(page),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Save failed");
      toast({ title: "Saved", description: "Page updated." });
      await load();
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Save failed",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function publish() {
    setPublishing(true);
    try {
      const res = await fetch("/api/admin/site-seo/publish", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Publish failed");
      toast({ title: "Published", description: "Caches invalidated for this tenant site." });
      await load();
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Publish failed",
        variant: "destructive",
      });
    } finally {
      setPublishing(false);
    }
  }

  async function addRedirect() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/site-seo/redirects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newRedirect),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setNewRedirect({ old_path: "", new_path: "", status_code: 301 });
      toast({ title: "Redirect added" });
      await load();
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteRedirect(id: string) {
    const res = await fetch(`/api/admin/site-seo/redirects?id=${id}`, { method: "DELETE" });
    const json = await res.json();
    if (!res.ok) {
      toast({ title: "Error", description: json.error, variant: "destructive" });
      return;
    }
    await load();
  }

  async function importCsv() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/site-seo/redirects/csv", {
        method: "POST",
        headers: { "Content-Type": "text/csv" },
        body: csvText,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Import failed");
      toast({
        title: "CSV imported",
        description: `${json.imported} redirects. ${json.errors?.length || 0} errors.`,
      });
      await load();
    } catch (e: unknown) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Import failed",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  function updateSelectedPage(patch: Record<string, unknown>) {
    if (!selectedPageId) return;
    setPages((prev) =>
      prev.map((p) => (p.id === selectedPageId ? { ...p, ...patch } : p))
    );
  }

  function addContentBlock(type: string) {
    if (!selectedPage) return;
    const blocks = Array.isArray(selectedPage.content_json)
      ? [...(selectedPage.content_json as unknown[])]
      : [];
    blocks.push({
      id: `${type}-${Date.now()}`,
      type,
      enabled: true,
      heading: type.replace(/_/g, " "),
      body: "",
      items: type === "faq" ? [{ q: "", a: "" }] : undefined,
    });
    updateSelectedPage({ content_json: blocks });
  }

  const chain = previewRedirectChain(
    redirects.map((r) => ({
      old_path: String(r.old_path),
      new_path: String(r.new_path),
      active: Boolean(r.active),
      status_code: Number(r.status_code) as 301 | 302,
    })),
    chainPreviewPath
  );

  const googleTitle =
    (selectedPage?.seo_title as string) ||
    (selectedPage?.title as string) ||
    (settings.website_name as string) ||
    "Page title";
  const googleDesc =
    (selectedPage?.meta_description as string) ||
    (settings.default_meta_description as string) ||
    "Meta description preview";
  const googleUrl = bundle?.context.primaryDomain
    ? `https://${bundle.context.primaryDomain}${selectedPage?.path || "/"}`
    : bundle?.context.previewUrl || "";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-600 gap-2">
        <Loader2 className="h-5 w-5 animate-spin" /> Loading SEO control centre…
      </div>
    );
  }

  if (!bundle) {
    return <div className="p-8 text-slate-600">Unable to load SEO data.</div>;
  }

  const healthChecks = bundle.health.checks || [];

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-6">
      <header className="flex flex-col gap-4 rounded-xl border bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-slate-900">
            {bundle.context.tenantName}
          </h1>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
            <span className="inline-flex items-center gap-1">
              <Globe className="h-4 w-4" />
              {bundle.context.primaryDomain || "No verified primary domain"}
            </span>
            <span>
              Indexing:{" "}
              <strong className="text-slate-800">{bundle.context.indexingState}</strong>
            </span>
            <span>
              Last published:{" "}
              {bundle.context.lastPublishedAt
                ? new Date(bundle.context.lastPublishedAt).toLocaleString()
                : "Never"}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <a href={bundle.context.previewUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="mr-2 h-4 w-4" />
              Preview website
            </a>
          </Button>
          <Button onClick={() => void publish()} disabled={publishing}>
            {publishing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Publish changes
          </Button>
        </div>
      </header>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="flex h-auto flex-wrap gap-1">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="defaults">Site Defaults</TabsTrigger>
          <TabsTrigger value="pages">Pages</TabsTrigger>
          <TabsTrigger value="local">Local Business</TabsTrigger>
          <TabsTrigger value="redirects">Redirects</TabsTrigger>
          <TabsTrigger value="domains">Domains & Migration</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Critical</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-semibold text-red-600">
                {bundle.health.critical}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Recommended</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-semibold text-amber-600">
                {bundle.health.recommended}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Pages</CardTitle>
              </CardHeader>
              <CardContent className="text-3xl font-semibold">{pages.length}</CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Health checks</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {healthChecks.length === 0 ? (
                <p className="flex items-center gap-2 text-green-700">
                  <CheckCircle2 className="h-4 w-4" /> No issues detected.
                </p>
              ) : (
                healthChecks.map((c) => (
                  <div
                    key={c.id}
                    className={`rounded-lg border p-3 ${
                      c.severity === "critical"
                        ? "border-red-200 bg-red-50"
                        : "border-amber-200 bg-amber-50"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle
                        className={`mt-0.5 h-4 w-4 ${
                          c.severity === "critical" ? "text-red-600" : "text-amber-600"
                        }`}
                      />
                      <div>
                        <p className="font-medium text-slate-900">{c.title}</p>
                        <p className="text-sm text-slate-600">{c.detail}</p>
                        {c.fixHint ? (
                          <p className="mt-1 text-sm text-slate-500">{c.fixHint}</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="defaults" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Site defaults</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field label="Website name">
                <Input
                  value={String(settings.website_name ?? "")}
                  onChange={(e) => setSettings({ ...settings, website_name: e.target.value })}
                />
              </Field>
              <Field label="Alternative site name">
                <Input
                  value={String(settings.alternative_site_name ?? "")}
                  onChange={(e) =>
                    setSettings({ ...settings, alternative_site_name: e.target.value })
                  }
                />
              </Field>
              <Field label="Default title template (use {page} and {site})">
                <Input
                  value={String(settings.default_title_template ?? "")}
                  onChange={(e) =>
                    setSettings({ ...settings, default_title_template: e.target.value })
                  }
                  placeholder="{page} | {site}"
                />
              </Field>
              <Field label="Primary language">
                <Input
                  value={String(settings.primary_language ?? "en-GB")}
                  onChange={(e) =>
                    setSettings({ ...settings, primary_language: e.target.value })
                  }
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="Default meta description">
                  <Textarea
                    value={String(settings.default_meta_description ?? "")}
                    onChange={(e) =>
                      setSettings({ ...settings, default_meta_description: e.target.value })
                    }
                    rows={3}
                  />
                </Field>
              </div>
              <Field label="Default OG image URL">
                <Input
                  value={String(settings.default_og_image_url ?? "")}
                  onChange={(e) =>
                    setSettings({ ...settings, default_og_image_url: e.target.value })
                  }
                />
              </Field>
              <Field label="Schema business type">
                <Input
                  value={String(settings.schema_business_type ?? "ParkingFacility")}
                  onChange={(e) =>
                    setSettings({ ...settings, schema_business_type: e.target.value })
                  }
                />
              </Field>
              <Field label="Logo URL">
                <Input
                  value={String(settings.logo_url ?? "")}
                  onChange={(e) => setSettings({ ...settings, logo_url: e.target.value })}
                />
              </Field>
              <Field label="Homepage presentation JSON (optional)">
                <Textarea
                  rows={5}
                  value={JSON.stringify(settings.presentation_json ?? {}, null, 2)}
                  onChange={(e) => {
                    try {
                      setSettings({
                        ...settings,
                        presentation_json: JSON.parse(e.target.value),
                      });
                    } catch {
                      /* ignore while typing */
                    }
                  }}
                  placeholder='{"footerDescription":"...","sections":{"reviews":false},"trustPoints":["Book online"]}'
                />
              </Field>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium">Allow indexing</p>
                  <p className="text-sm text-slate-500">Site-wide indexing switch</p>
                </div>
                <Switch
                  checked={Boolean(settings.allow_indexing ?? true)}
                  onCheckedChange={(v) => setSettings({ ...settings, allow_indexing: v })}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium">Default robots index</p>
                </div>
                <Switch
                  checked={Boolean(settings.default_robots_index ?? true)}
                  onCheckedChange={(v) =>
                    setSettings({ ...settings, default_robots_index: v })
                  }
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <p className="font-medium">Default robots follow</p>
                </div>
                <Switch
                  checked={Boolean(settings.default_robots_follow ?? true)}
                  onCheckedChange={(v) =>
                    setSettings({ ...settings, default_robots_follow: v })
                  }
                />
              </div>
              {bundle.context.tenantId ? (
                <div className="md:col-span-2">
                  <UploadTenantLogo
                    tenantId={bundle.context.tenantId}
                    currentLogoUrl={String(settings.logo_url || profile.logo_url || "")}
                    onLogoUpdated={(url) => {
                      setSettings({ ...settings, logo_url: url });
                      setProfile({ ...profile, logo_url: url });
                    }}
                  />
                </div>
              ) : null}
            </CardContent>
          </Card>
          <Button onClick={() => void saveSettings()} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save site defaults
          </Button>
        </TabsContent>

        <TabsContent value="pages" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Pages</CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const path = window.prompt("New page path (e.g. /parking-info)");
                    const title = window.prompt("Page title");
                    if (!path || !title) return;
                    const res = await fetch("/api/admin/site-seo/pages", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ path, title }),
                    });
                    const json = await res.json();
                    if (!res.ok) {
                      toast({ title: "Error", description: json.error, variant: "destructive" });
                      return;
                    }
                    await load();
                    setSelectedPageId(json.data.id);
                  }}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[70vh] overflow-auto">
                {pages.map((p) => {
                  const warnings = pageHealthWarnings(
                    healthChecks as never,
                    String(p.path)
                  );
                  return (
                    <button
                      key={String(p.id)}
                      type="button"
                      onClick={() => setSelectedPageId(String(p.id))}
                      className={`w-full rounded-lg border p-3 text-left text-sm transition ${
                        selectedPageId === p.id
                          ? "border-sky-400 bg-sky-50"
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <div className="font-medium">{String(p.title)}</div>
                      <div className="text-slate-500">{String(p.path)}</div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs">
                        <span
                          className={
                            p.robots_index === false
                              ? "text-amber-700"
                              : "text-green-700"
                          }
                        >
                          {p.robots_index === false ? "noindex" : "index"}
                        </span>
                        <span>{String(p.status)}</span>
                        {warnings.length ? (
                          <span className="text-red-600">{warnings.length} warn</span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            </Card>

            {selectedPage ? (
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>
                      Edit: {String(selectedPage.title)}{" "}
                      {selectedPage.page_key ? (
                        <span className="text-sm font-normal text-slate-500">
                          ({String(selectedPage.page_key)})
                        </span>
                      ) : null}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="grid gap-4 md:grid-cols-2">
                    <Field label="Page title">
                      <Input
                        value={String(selectedPage.title ?? "")}
                        onChange={(e) => updateSelectedPage({ title: e.target.value })}
                      />
                    </Field>
                    <Field label="Path">
                      <Input
                        value={String(selectedPage.path ?? "")}
                        onChange={(e) => updateSelectedPage({ path: e.target.value })}
                        disabled={Boolean(selectedPage.page_key)}
                      />
                    </Field>
                    <Field label="SEO title">
                      <Input
                        value={String(selectedPage.seo_title ?? "")}
                        onChange={(e) => updateSelectedPage({ seo_title: e.target.value })}
                      />
                    </Field>
                    <Field label="H1">
                      <Input
                        value={String(selectedPage.h1 ?? "")}
                        onChange={(e) => updateSelectedPage({ h1: e.target.value })}
                      />
                    </Field>
                    <div className="md:col-span-2">
                      <Field label="Meta description">
                        <Textarea
                          rows={3}
                          value={String(selectedPage.meta_description ?? "")}
                          onChange={(e) =>
                            updateSelectedPage({ meta_description: e.target.value })
                          }
                        />
                      </Field>
                    </div>
                    <Field label="Canonical path">
                      <Input
                        value={String(selectedPage.canonical_path ?? "")}
                        onChange={(e) =>
                          updateSelectedPage({ canonical_path: e.target.value })
                        }
                        placeholder="/same-as-path"
                      />
                    </Field>
                    <Field label="Status">
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                        value={String(selectedPage.status ?? "published")}
                        onChange={(e) => updateSelectedPage({ status: e.target.value })}
                      >
                        <option value="draft">draft</option>
                        <option value="published">published</option>
                        <option value="archived">archived</option>
                      </select>
                    </Field>
                    <Field label="OG title">
                      <Input
                        value={String(selectedPage.og_title ?? "")}
                        onChange={(e) => updateSelectedPage({ og_title: e.target.value })}
                      />
                    </Field>
                    <Field label="OG image URL">
                      <Input
                        value={String(selectedPage.og_image_url ?? "")}
                        onChange={(e) =>
                          updateSelectedPage({ og_image_url: e.target.value })
                        }
                      />
                    </Field>
                    <div className="md:col-span-2">
                      <Field label="OG description">
                        <Textarea
                          rows={2}
                          value={String(selectedPage.og_description ?? "")}
                          onChange={(e) =>
                            updateSelectedPage({ og_description: e.target.value })
                          }
                        />
                      </Field>
                    </div>
                    <Field label="Navigation label">
                      <Input
                        value={String(selectedPage.nav_label ?? "")}
                        onChange={(e) => updateSelectedPage({ nav_label: e.target.value })}
                      />
                    </Field>
                    <Field label="Navigation order">
                      <Input
                        type="number"
                        value={Number(selectedPage.nav_order ?? 0)}
                        onChange={(e) =>
                          updateSelectedPage({ nav_order: Number(e.target.value) })
                        }
                      />
                    </Field>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <span>Robots index</span>
                      <Switch
                        checked={Boolean(selectedPage.robots_index ?? true)}
                        onCheckedChange={(v) => updateSelectedPage({ robots_index: v })}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <span>Robots follow</span>
                      <Switch
                        checked={Boolean(selectedPage.robots_follow ?? true)}
                        onCheckedChange={(v) => updateSelectedPage({ robots_follow: v })}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-lg border p-3">
                      <span>Show in navigation</span>
                      <Switch
                        checked={Boolean(selectedPage.show_in_navigation)}
                        onCheckedChange={(v) =>
                          updateSelectedPage({ show_in_navigation: v })
                        }
                      />
                    </div>
                    <div className="md:col-span-2">
                      <Field label="Introductory text / excerpt">
                        <Textarea
                          rows={3}
                          value={String(selectedPage.excerpt ?? "")}
                          onChange={(e) => updateSelectedPage({ excerpt: e.target.value })}
                        />
                      </Field>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-base">Content blocks</CardTitle>
                    <select
                      className="h-9 rounded-md border px-2 text-sm"
                      defaultValue=""
                      onChange={(e) => {
                        if (e.target.value) {
                          addContentBlock(e.target.value);
                          e.target.value = "";
                        }
                      }}
                    >
                      <option value="">Add block…</option>
                      {CONTENT_BLOCK_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(Array.isArray(selectedPage.content_json)
                      ? (selectedPage.content_json as Array<Record<string, unknown>>)
                      : []
                    ).map((block, idx) => (
                      <div key={String(block.id || idx)} className="rounded-lg border p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{String(block.type)}</span>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              const blocks = [
                                ...(selectedPage.content_json as unknown[]),
                              ];
                              blocks.splice(idx, 1);
                              updateSelectedPage({ content_json: blocks });
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <Input
                          placeholder="Heading / title"
                          value={String(block.heading || block.title || "")}
                          onChange={(e) => {
                            const blocks = [
                              ...(selectedPage.content_json as Array<Record<string, unknown>>),
                            ];
                            blocks[idx] = {
                              ...blocks[idx],
                              heading: e.target.value,
                              title: e.target.value,
                            };
                            updateSelectedPage({ content_json: blocks });
                          }}
                        />
                        <Textarea
                          placeholder="Body"
                          rows={3}
                          value={String(block.body || block.subtitle || "")}
                          onChange={(e) => {
                            const blocks = [
                              ...(selectedPage.content_json as Array<Record<string, unknown>>),
                            ];
                            blocks[idx] = {
                              ...blocks[idx],
                              body: e.target.value,
                              subtitle: e.target.value,
                            };
                            updateSelectedPage({ content_json: blocks });
                          }}
                        />
                        {block.type === "faq" ? (
                          <Textarea
                            rows={4}
                            placeholder={'FAQ JSON: [{"q":"...","a":"..."}]'}
                            value={JSON.stringify(block.items ?? [], null, 2)}
                            onChange={(e) => {
                              try {
                                const items = JSON.parse(e.target.value);
                                const blocks = [
                                  ...(selectedPage.content_json as Array<
                                    Record<string, unknown>
                                  >),
                                ];
                                blocks[idx] = { ...blocks[idx], items };
                                updateSelectedPage({ content_json: blocks });
                              } catch {
                                /* ignore while typing */
                              }
                            }}
                          />
                        ) : null}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Previews</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="rounded-lg border bg-[#f8f9fa] p-4">
                      <p className="text-[#1a0dab] text-xl leading-snug truncate">
                        {googleTitle}
                      </p>
                      <p className="text-[#006621] text-sm truncate">{googleUrl}</p>
                      <p className="text-[#4d5156] text-sm line-clamp-2">{googleDesc}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant={previewDevice === "desktop" ? "default" : "outline"}
                        onClick={() => setPreviewDevice("desktop")}
                      >
                        Desktop
                      </Button>
                      <Button
                        size="sm"
                        variant={previewDevice === "mobile" ? "default" : "outline"}
                        onClick={() => setPreviewDevice("mobile")}
                      >
                        Mobile
                      </Button>
                    </div>
                    <div
                      className={`mx-auto rounded-xl border bg-white p-4 shadow-sm ${
                        previewDevice === "mobile" ? "max-w-sm" : "max-w-3xl"
                      }`}
                    >
                      <h1 className="text-2xl font-semibold">
                        {String(selectedPage.h1 || selectedPage.title)}
                      </h1>
                      <p className="mt-2 text-slate-600">
                        {String(selectedPage.excerpt || selectedPage.meta_description || "")}
                      </p>
                    </div>
                  </CardContent>
                </Card>

                <Button onClick={() => void savePage(selectedPage)} disabled={saving}>
                  {saving ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="mr-2 h-4 w-4" />
                  )}
                  Save page
                </Button>
              </div>
            ) : null}
          </div>
        </TabsContent>

        <TabsContent value="local" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Local business profile</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field label="Business name">
                <Input
                  value={String(profile.business_name ?? "")}
                  onChange={(e) => setProfile({ ...profile, business_name: e.target.value })}
                />
              </Field>
              <Field label="Alternative name">
                <Input
                  value={String(profile.alternative_name ?? "")}
                  onChange={(e) =>
                    setProfile({ ...profile, alternative_name: e.target.value })
                  }
                />
              </Field>
              <Field label="Telephone">
                <Input
                  value={String(profile.phone ?? "")}
                  onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                />
              </Field>
              <Field label="Email">
                <Input
                  value={String(profile.email ?? "")}
                  onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                />
              </Field>
              <Field label="Website">
                <Input
                  value={String(profile.website ?? "")}
                  onChange={(e) => setProfile({ ...profile, website: e.target.value })}
                />
              </Field>
              <Field label="Price range">
                <Input
                  value={String(profile.price_range ?? "")}
                  onChange={(e) => setProfile({ ...profile, price_range: e.target.value })}
                />
              </Field>
              <Field label="Street address">
                <Input
                  value={String(address.street ?? "")}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      address: { ...address, street: e.target.value },
                    })
                  }
                />
              </Field>
              <Field label="Town / city">
                <Input
                  value={String(address.city ?? "")}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      address: { ...address, city: e.target.value },
                    })
                  }
                />
              </Field>
              <Field label="County">
                <Input
                  value={String(profile.county ?? address.county ?? "")}
                  onChange={(e) => setProfile({ ...profile, county: e.target.value })}
                />
              </Field>
              <Field label="Postcode">
                <Input
                  value={String(address.postalCode ?? "")}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      address: { ...address, postalCode: e.target.value },
                    })
                  }
                />
              </Field>
              <Field label="Country">
                <Input
                  value={String(profile.country ?? address.country ?? "GB")}
                  onChange={(e) => setProfile({ ...profile, country: e.target.value })}
                />
              </Field>
              <Field label="What3Words">
                <Input
                  value={String(profile.what3words ?? "")}
                  onChange={(e) => setProfile({ ...profile, what3words: e.target.value })}
                />
              </Field>
              <Field label="Latitude">
                <Input
                  value={String(profile.latitude ?? "")}
                  onChange={(e) => setProfile({ ...profile, latitude: e.target.value })}
                />
              </Field>
              <Field label="Longitude">
                <Input
                  value={String(profile.longitude ?? "")}
                  onChange={(e) => setProfile({ ...profile, longitude: e.target.value })}
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="Business description">
                  <Textarea
                    rows={4}
                    value={String(
                      profile.business_description ?? profile.about_text ?? ""
                    )}
                    onChange={(e) =>
                      setProfile({
                        ...profile,
                        business_description: e.target.value,
                        about_text: e.target.value,
                      })
                    }
                  />
                </Field>
              </div>
              <Field label="Airports served (comma-separated)">
                <Input
                  value={Array.isArray(profile.airports) ? profile.airports.join(", ") : ""}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      airports: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </Field>
              <Field label="Facilities / features (comma-separated)">
                <Input
                  value={Array.isArray(profile.features) ? profile.features.join(", ") : ""}
                  onChange={(e) =>
                    setProfile({
                      ...profile,
                      features: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                />
              </Field>
              <Field label="Facebook URL">
                <Input
                  value={String(profile.facebook_url ?? "")}
                  onChange={(e) => setProfile({ ...profile, facebook_url: e.target.value })}
                />
              </Field>
              <Field label="Instagram URL">
                <Input
                  value={String(profile.instagram_url ?? "")}
                  onChange={(e) =>
                    setProfile({ ...profile, instagram_url: e.target.value })
                  }
                />
              </Field>
              <div className="md:col-span-2">
                <Field label="Opening hours JSON">
                  <Textarea
                    rows={4}
                    value={JSON.stringify(profile.hours ?? [], null, 2)}
                    onChange={(e) => {
                      try {
                        setProfile({ ...profile, hours: JSON.parse(e.target.value) });
                      } catch {
                        /* ignore */
                      }
                    }}
                    placeholder='[{"day":"Monday","open":"00:00","close":"23:59"}]'
                  />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="External review profile links JSON">
                  <Textarea
                    rows={3}
                    value={JSON.stringify(profile.external_review_links ?? [], null, 2)}
                    onChange={(e) => {
                      try {
                        setProfile({
                          ...profile,
                          external_review_links: JSON.parse(e.target.value),
                        });
                      } catch {
                        /* ignore */
                      }
                    }}
                  />
                </Field>
              </div>
              <div className="md:col-span-2">
                <Field label="FAQ JSON (q/a)">
                  <Textarea
                    rows={6}
                    value={JSON.stringify(profile.faq ?? [], null, 2)}
                    onChange={(e) => {
                      try {
                        setProfile({ ...profile, faq: JSON.parse(e.target.value) });
                      } catch {
                        /* ignore */
                      }
                    }}
                  />
                </Field>
              </div>
            </CardContent>
          </Card>
          <Button onClick={() => void saveProfile()} disabled={saving}>
            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save local business
          </Button>
        </TabsContent>

        <TabsContent value="redirects" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Redirects</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 md:grid-cols-4">
                <Input
                  placeholder="/old-path"
                  value={newRedirect.old_path}
                  onChange={(e) =>
                    setNewRedirect({ ...newRedirect, old_path: e.target.value })
                  }
                />
                <Input
                  placeholder="/new-path"
                  value={newRedirect.new_path}
                  onChange={(e) =>
                    setNewRedirect({ ...newRedirect, new_path: e.target.value })
                  }
                />
                <select
                  className="h-9 rounded-md border px-2 text-sm"
                  value={newRedirect.status_code}
                  onChange={(e) =>
                    setNewRedirect({
                      ...newRedirect,
                      status_code: Number(e.target.value),
                    })
                  }
                >
                  <option value={301}>301</option>
                  <option value={302}>302</option>
                </select>
                <Button onClick={() => void addRedirect()} disabled={saving}>
                  Add redirect
                </Button>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2">Old</th>
                      <th>New</th>
                      <th>Code</th>
                      <th>Hits</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {redirects.map((r) => (
                      <tr key={String(r.id)} className="border-b">
                        <td className="py-2 font-mono text-xs">{String(r.old_path)}</td>
                        <td className="font-mono text-xs">{String(r.new_path)}</td>
                        <td>{String(r.status_code)}</td>
                        <td>{String(r.hit_count ?? 0)}</td>
                        <td>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => void deleteRedirect(String(r.id))}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Preview redirect chain</Label>
                  <div className="mt-1 flex gap-2">
                    <Input
                      value={chainPreviewPath}
                      onChange={(e) => setChainPreviewPath(e.target.value)}
                    />
                  </div>
                  <p className="mt-2 text-sm text-slate-600">
                    {chain.chain.join(" → ")}
                    {chain.loop ? " (loop detected)" : ""}
                  </p>
                </div>
                <div>
                  <Label>CSV import</Label>
                  <Textarea
                    className="mt-1"
                    rows={4}
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    placeholder={"old_path,new_path,status_code,active\n/old,/new,301,true"}
                  />
                  <div className="mt-2 flex gap-2">
                    <Button variant="outline" onClick={() => void importCsv()}>
                      <Upload className="mr-2 h-4 w-4" /> Import CSV
                    </Button>
                    <Button variant="outline" asChild>
                      <a href="/api/admin/site-seo/redirects/csv">Export CSV</a>
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="domains" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Domains & migration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-slate-600">
                Current primary (canonical) domain:{" "}
                <strong>{bundle.context.primaryDomain || "—"}</strong>
              </p>
              <p className="text-sm text-slate-600">
                Platform preview:{" "}
                <code>{bundle.context.tenantSlug}.myparkingchannel.app</code>
              </p>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="py-2">Domain</th>
                      <th>Primary</th>
                      <th>Verified</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(bundle.domains || []).map((d) => (
                      <tr key={String(d.id)} className="border-b">
                        <td className="py-2">{String(d.domain)}</td>
                        <td>{d.is_primary ? "yes" : "no"}</td>
                        <td>{d.verified ? "yes" : "no"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Field label="Indexing mode">
                <select
                  className="flex h-9 w-full rounded-md border px-3 text-sm"
                  value={String(settings.indexing_mode ?? "live_indexable")}
                  onChange={(e) =>
                    setSettings({ ...settings, indexing_mode: e.target.value })
                  }
                >
                  <option value="live_indexable">Live and indexable</option>
                  <option value="staging_noindex">Staging / migration — noindex</option>
                  <option value="canonical_to_existing">Canonical to existing domain</option>
                </select>
              </Field>
              <Field label="Canonical domain override (must be a verified domain)">
                <Input
                  value={String(settings.canonical_domain_override ?? "")}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      canonical_domain_override: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Migration target domain (planner only — does not activate DNS)">
                <Input
                  value={String(settings.migration_target_domain ?? "")}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      migration_target_domain: e.target.value,
                    })
                  }
                  placeholder="future-primary.example"
                />
              </Field>
              <Field label="Migration notes">
                <Textarea
                  rows={4}
                  value={String(settings.migration_notes ?? "")}
                  onChange={(e) =>
                    setSettings({ ...settings, migration_notes: e.target.value })
                  }
                />
              </Field>
              <p className="text-xs text-slate-500">
                Saving migration target prepares the plan only. It does not change DNS or
                switch the live primary domain.
              </p>
              <Button onClick={() => void saveSettings()} disabled={saving}>
                Save domain / migration settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="integrations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Integrations</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <Field label="Google Search Console verification">
                <Input
                  value={String(settings.google_search_console_verification ?? "")}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      google_search_console_verification: e.target.value,
                    })
                  }
                />
              </Field>
              <Field label="Bing verification">
                <Input
                  value={String(settings.bing_verification ?? "")}
                  onChange={(e) =>
                    setSettings({ ...settings, bing_verification: e.target.value })
                  }
                />
              </Field>
              <Field label="GA4 measurement ID">
                <Input
                  value={String(settings.ga4_measurement_id ?? "")}
                  onChange={(e) =>
                    setSettings({ ...settings, ga4_measurement_id: e.target.value })
                  }
                  placeholder="G-XXXXXXXX"
                />
              </Field>
              <Field label="Google Tag Manager ID">
                <Input
                  value={String(settings.google_tag_manager_id ?? "")}
                  onChange={(e) =>
                    setSettings({ ...settings, google_tag_manager_id: e.target.value })
                  }
                  placeholder="GTM-XXXX"
                />
              </Field>
              <Field label="Microsoft Clarity ID">
                <Input
                  value={String(settings.microsoft_clarity_id ?? "")}
                  onChange={(e) =>
                    setSettings({ ...settings, microsoft_clarity_id: e.target.value })
                  }
                />
              </Field>
              <Field label="Cookie consent mode">
                <select
                  className="flex h-9 w-full rounded-md border px-3 text-sm"
                  value={String(settings.cookie_consent_mode ?? "basic")}
                  onChange={(e) =>
                    setSettings({ ...settings, cookie_consent_mode: e.target.value })
                  }
                >
                  <option value="off">off</option>
                  <option value="basic">basic</option>
                  <option value="strict">strict</option>
                </select>
              </Field>
            </CardContent>
          </Card>
          <Button onClick={() => void saveSettings()} disabled={saving}>
            Save integrations
          </Button>
        </TabsContent>
      </Tabs>
    </div>
  );
}
