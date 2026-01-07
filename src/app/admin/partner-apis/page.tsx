"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useTenant } from "@/hooks/useTenant";
import { Loader2, Plus, Trash2, Eye, EyeOff, Copy, Check, X, Download } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SupplierApiDocs } from "@/components/admin/SupplierApiDocs";

type PartnerApiKey = {
  id: string;
  name: string;
  scopes: string[];
  is_active: boolean;
  is_test?: boolean;
  last_used_at: string | null;
  created_at: string;
  channel_id?: string | null;
  tenant_channels?: {
    id: string;
    code: string;
    name: string;
  } | null;
};

export default function PartnerApisPage() {
  const { tenantId, loading: tenantLoading } = useTenant();
  const [keys, setKeys] = useState<PartnerApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<string[]>([]);
  const [selectedChannelId, setSelectedChannelId] = useState<string>("");
  const [partnerCode, setPartnerCode] = useState<string>(""); // e.g. "cavu", "holiday_extras"
  const [isTest, setIsTest] = useState<boolean>(false);
  const [channels, setChannels] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null);

  const availableScopes = ["products", "availability", "bookings"];

  useEffect(() => {
    if (tenantId) {
      loadKeys();
      loadChannels();
    }
  }, [tenantId]);

  async function loadChannels() {
    try {
      const res = await fetch("/api/admin/channels");
      const json = await res.json();
      if (json.channels) {
        setChannels(json.channels.filter((ch: any) => ch.is_active));
      }
    } catch (err) {
      console.error("Error loading channels:", err);
    }
  }

  async function loadKeys() {
    if (!tenantId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/admin/partner-apis");
      const json = await res.json();
      if (json.keys) {
        setKeys(json.keys);
      } else if (json.error) {
        toast({
          title: "Error",
          description: json.error,
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to load API keys",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    if (!tenantId || !newKeyName || selectedScopes.length === 0) {
      toast({
        title: "Error",
        description: "Name and at least one scope are required",
        variant: "destructive",
      });
      return;
    }

    setCreating(true);
    try {
      const res = await fetch("/api/admin/partner-apis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
          name: newKeyName,
          scopes: selectedScopes,
          channel_id: selectedChannelId || null,
          partner_code: partnerCode || null, // Auto-create channel if provided
          is_test: isTest,
        }),
      });

      const json = await res.json();
      if (json.key && json.rawApiKey) {
        setNewRawKey(json.rawApiKey);
        setKeys([json.key, ...keys]);
        setNewKeyName("");
        setSelectedScopes([]);
        setSelectedChannelId("");
        setPartnerCode("");
        setIsTest(false);
        toast({
          title: "Success",
          description: "API key created successfully. Copy it now - you won't see it again!",
        });
      } else if (json.error) {
        toast({
          title: "Error",
          description: json.error,
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to create API key",
        variant: "destructive",
      });
    } finally {
      setCreating(false);
    }
  }

  async function handleToggleActive(key: PartnerApiKey) {
    try {
      const res = await fetch(`/api/admin/partner-apis/${key.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !key.is_active }),
      });

      const json = await res.json();
      if (json.key) {
        setKeys(keys.map((k) => (k.id === key.id ? json.key : k)));
        toast({
          title: "Success",
          description: `API key ${json.key.is_active ? "activated" : "deactivated"}`,
        });
      } else if (json.error) {
        toast({
          title: "Error",
          description: json.error,
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to update API key",
        variant: "destructive",
      });
    }
  }

  async function handleDelete(key: PartnerApiKey) {
    if (!confirm(`Are you sure you want to delete "${key.name}"? This cannot be undone.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/partner-apis/${key.id}`, {
        method: "DELETE",
      });

      const json = await res.json();
      if (json.success) {
        setKeys(keys.filter((k) => k.id !== key.id));
        toast({
          title: "Success",
          description: "API key deleted",
        });
      } else if (json.error) {
        toast({
          title: "Error",
          description: json.error,
          variant: "destructive",
        });
      }
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || "Failed to delete API key",
        variant: "destructive",
      });
    }
  }

  function copyToClipboard(text: string, keyId: string) {
    navigator.clipboard.writeText(text);
    setCopiedKeyId(keyId);
    toast({
      title: "Copied",
      description: "API key copied to clipboard",
    });
    setTimeout(() => setCopiedKeyId(null), 2000);
  }

  async function handleDownloadSpec(keyId: string, format: 'md' | 'pdf') {
    try {
      const url = `/api/admin/partner-apis/spec?keyId=${keyId}&format=${format}`;
      const response = await fetch(url);
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: { message: 'Download failed' } }));
        toast({
          title: "Error",
          description: error.error?.message || 'Failed to download spec',
          variant: "destructive",
        });
        return;
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = response.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || `spec.${format}`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } catch (err: any) {
      toast({
        title: "Error",
        description: err.message || 'Failed to download spec',
        variant: "destructive",
      });
    }
  }

  function formatDate(dateString: string | null) {
    if (!dateString) return "Never";
    return new Date(dateString).toLocaleString();
  }

  if (tenantLoading || loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Partner API Keys</h1>
          <p className="text-gray-600 mt-1">
            Manage API keys for external partners like CAVU and Holiday Extras
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Create API Key
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
          <CardDescription>
            These keys allow external partners to access your supplier API endpoints
          </CardDescription>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No API keys yet. Create one to get started.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Channel</TableHead>
                  <TableHead>Scopes</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium">{key.name}</TableCell>
                    <TableCell>
                      {key.tenant_channels ? (
                        <Badge variant="outline">
                          {key.tenant_channels.name} ({key.tenant_channels.code})
                        </Badge>
                      ) : (
                        <span className="text-sm text-gray-400">Default</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {key.scopes.map((scope) => (
                          <Badge key={scope} variant="outline">
                            {scope}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      {key.is_test ? (
                        <Badge variant="outline" className="bg-yellow-50 text-yellow-700 border-yellow-200">
                          Test
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                          Production
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={key.is_active ? "default" : "secondary"}>
                        {key.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {formatDate(key.last_used_at)}
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {formatDate(key.created_at)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <div className="inline-flex items-center gap-1">
                          <span className="text-[11px] text-slate-500">Download:</span>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownloadSpec(key.id, 'md')}
                          >
                            .md
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownloadSpec(key.id, 'pdf')}
                          >
                            PDF
                          </Button>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggleActive(key)}
                        >
                          {key.is_active ? "Deactivate" : "Activate"}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(key)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Create Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle>Create Partner API Key</DialogTitle>
            <DialogDescription>
              Generate a new API key for an external partner. The key will only be shown once.
            </DialogDescription>
          </DialogHeader>
          {newRawKey ? (
            <div className="space-y-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm font-medium text-yellow-800 mb-2">
                  ⚠️ Copy this API key now - you won't be able to see it again!
                </p>
                <div className="flex gap-2">
                  <Input
                    value={newRawKey}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => copyToClipboard(newRawKey, "new")}
                  >
                    {copiedKeyId === "new" ? (
                      <Check className="h-4 w-4" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => {
                  setNewRawKey(null);
                  setShowCreateDialog(false);
                }}>
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Partner Name</Label>
                <Input
                  id="name"
                  value={newKeyName}
                  onChange={(e) => setNewKeyName(e.target.value)}
                  placeholder="e.g. CAVU, Holiday Extras"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="partner_code">Partner Code (Optional)</Label>
                <Input
                  id="partner_code"
                  value={partnerCode}
                  onChange={(e) => setPartnerCode(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
                  placeholder="e.g. cavu, holiday_extras"
                />
                <p className="text-xs text-gray-500">
                  Enter a partner code to automatically create a channel for this partner. 
                  This allows you to set individual pricing for each partner (e.g., CAVU can have different prices than Holiday Extras).
                  If left empty, you can manually select a channel below.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="channel">Channel (Optional)</Label>
                <Select value={selectedChannelId || undefined} onValueChange={(value) => setSelectedChannelId(value || "")}>
                  <SelectTrigger id="channel">
                    <SelectValue placeholder="No channel (defaults to 'agent')" />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map((ch) => (
                      <SelectItem key={ch.id} value={ch.id}>
                        {ch.name} ({ch.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  {partnerCode 
                    ? `A channel will be auto-created from partner code "${partnerCode}" if no channel is selected.`
                    : 'Select a channel to use channel-specific pricing for this API key. If not set, defaults to "agent" channel.'}
                </p>
              </div>
              <div className="space-y-2">
                <Label>Scopes</Label>
                <div className="space-y-2">
                  {availableScopes.map((scope) => (
                    <div key={scope} className="flex items-center space-x-2">
                      <Checkbox
                        id={scope}
                        checked={selectedScopes.includes(scope)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedScopes([...selectedScopes, scope]);
                          } else {
                            setSelectedScopes(selectedScopes.filter((s) => s !== scope));
                          }
                        }}
                      />
                      <Label htmlFor={scope} className="font-normal cursor-pointer">
                        {scope}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="is_test"
                    checked={isTest}
                    onCheckedChange={(checked) => setIsTest(checked === true)}
                  />
                  <Label htmlFor="is_test" className="font-normal cursor-pointer">
                    Test API Key
                  </Label>
                </div>
                <p className="text-xs text-gray-500 ml-6">
                  Enable this to create a test API key for partner testing. Test keys work identically to production keys but are marked for testing purposes.
                </p>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleCreate} disabled={creating || !newKeyName || selectedScopes.length === 0}>
                  {creating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    "Create Key"
                  )}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Supplier API Docs */}
      <SupplierApiDocs />
    </div>
  );
}

