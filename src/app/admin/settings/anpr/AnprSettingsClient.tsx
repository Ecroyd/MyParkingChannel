'use client'

import { useState, useEffect } from 'react'
import { useTenant } from '@/hooks/useTenant'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Copy, Check, Loader2, RefreshCw, Key } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

type AnprSite = {
  id: string
  name: string
  enabled: boolean
  loc_pc_no: number
  site_client_license: number | null
  default_group: number
  include_upcoming_hours: number
  grace_after_end_hours: number
  min_snapshot_plates: number
  allow_small_snapshot_manual: boolean
}

export default function AnprSettingsClient() {
  const { tenantId, loading: tenantLoading } = useTenant()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [relayToken, setRelayToken] = useState<string | null>(null)
  const [tokenCopied, setTokenCopied] = useState(false)
  const [formData, setFormData] = useState<AnprSite>({
    id: '',
    name: 'Main Site',
    enabled: false,
    loc_pc_no: 998,
    site_client_license: null,
    default_group: 4,
    include_upcoming_hours: 48,
    grace_after_end_hours: 12,
    min_snapshot_plates: 10,
    allow_small_snapshot_manual: true,
  })

  useEffect(() => {
    if (tenantId) {
      loadConfig()
    }
  }, [tenantId])

  async function loadConfig() {
    if (!tenantId) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`/api/admin/anpr-sites?tenantId=${tenantId}`)
      const json = await res.json()
      if (json.success) {
        if (json.data) {
          setFormData(json.data)
        }
      } else {
        setError(json.error || 'Failed to load ANPR settings')
      }
    } catch (err) {
      console.error('Failed to load ANPR settings:', err)
      setError('Failed to load ANPR settings')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!tenantId) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/admin/anpr-sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          name: formData.name,
          enabled: formData.enabled,
          locPcNo: formData.loc_pc_no,
          siteClientLicense: formData.site_client_license,
          defaultGroup: formData.default_group,
          includeUpcomingHours: formData.include_upcoming_hours,
          graceAfterEndHours: formData.grace_after_end_hours,
          minSnapshotPlates: formData.min_snapshot_plates,
          allowSmallSnapshotManual: formData.allow_small_snapshot_manual,
        }),
      })

      const json = await res.json()
      if (json.success) {
        toast({
          title: 'Success',
          description: 'ANPR settings saved successfully',
        })
        if (json.relayToken) {
          setRelayToken(json.relayToken)
        }
        await loadConfig()
      } else {
        setError(json.error || 'Failed to save settings')
        toast({
          title: 'Error',
          description: json.error || 'Failed to save ANPR settings',
          variant: 'destructive',
        })
      }
    } catch (err) {
      console.error('Failed to save ANPR settings:', err)
      setError('Failed to save ANPR settings')
      toast({
        title: 'Error',
        description: 'Failed to save ANPR settings',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleGenerateToken() {
    if (!tenantId) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/internal/anpr/rotate-token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      })

      const json = await res.json()
      if (json.success && json.relayToken) {
        setRelayToken(json.relayToken)
        toast({
          title: 'Success',
          description: 'New relay token generated. Copy it now - it will not be shown again!',
        })
      } else {
        setError(json.error || 'Failed to generate token')
        toast({
          title: 'Error',
          description: json.error || 'Failed to generate relay token',
          variant: 'destructive',
        })
      }
    } catch (err) {
      console.error('Failed to generate token:', err)
      setError('Failed to generate relay token')
      toast({
        title: 'Error',
        description: 'Failed to generate relay token',
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleEmitSnapshot() {
    if (!tenantId) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/anpr-sites/emit-snapshot?debug=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, debug: true }),
      })

      const json = await res.json()
      if (json.success) {
        const debugInfo = json.debug ? ` (Scanned: ${json.debug.bookingsScanned}, Upserts: ${json.debug.outboxUpserts}, Pending: ${json.debug.pendingCount})` : ''
        toast({
          title: 'Success',
          description: `Snapshot generated: ${json.inserted} inserted, ${json.updated} updated${debugInfo}`,
        })
      } else {
        const errorDetails = json.details ? ` Details: ${JSON.stringify(json.details)}` : ''
        toast({
          title: 'Error',
          description: (json.error || 'Failed to emit snapshot') + errorDetails,
          variant: 'destructive',
        })
      }
    } catch (err) {
      console.error('Failed to emit snapshot:', err)
      toast({
        title: 'Error',
        description: `Failed to emit snapshot: ${err instanceof Error ? err.message : String(err)}`,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  function copyToken() {
    if (relayToken) {
      navigator.clipboard.writeText(relayToken)
      setTokenCopied(true)
      setTimeout(() => setTokenCopied(false), 2000)
      toast({
        title: 'Copied',
        description: 'Relay token copied to clipboard',
      })
    }
  }

  if (tenantLoading || loading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }

  if (!tenantId) {
    return (
      <div className="p-6 text-red-600">
        No tenant resolved. Please access this page from a tenant context.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">ANPR Relay Settings</h1>
        <p className="text-sm text-gray-500">Configure SNAP/Videofit ANPR relay integration</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {relayToken && (
        <Alert>
          <AlertDescription>
            <div className="space-y-2">
              <p className="font-medium">New Relay Token Generated</p>
              <p className="text-sm text-gray-600">
                Copy this token now - it will not be shown again!
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 p-2 bg-gray-100 rounded text-sm font-mono break-all">
                  {relayToken}
                </code>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={copyToken}
                  className="shrink-0"
                >
                  {tokenCopied ? (
                    <>
                      <Check className="h-4 w-4 mr-2" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4 mr-2" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="text-sm">Basic Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>Enabled</Label>
              <p className="text-xs text-gray-500">Enable ANPR relay processing</p>
            </div>
            <Switch
              checked={formData.enabled}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, enabled: checked })
              }
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Site Name</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Main Site"
              />
            </div>

            <div>
              <Label>Location PC No</Label>
              <Input
                type="number"
                value={formData.loc_pc_no}
                onChange={(e) =>
                  setFormData({ ...formData, loc_pc_no: parseInt(e.target.value) || 998 })
                }
              />
            </div>

            <div>
              <Label>Site Client License</Label>
              <Input
                type="number"
                value={formData.site_client_license || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    site_client_license: e.target.value ? parseInt(e.target.value) : null,
                  })
                }
                placeholder="Optional"
              />
            </div>

            <div>
              <Label>Default Group</Label>
              <Input
                type="number"
                value={formData.default_group}
                onChange={(e) =>
                  setFormData({ ...formData, default_group: parseInt(e.target.value) || 4 })
                }
              />
              <p className="text-xs text-gray-500 mt-1">Default vehicle group (default: 4 = Self Park)</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="text-sm">Snapshot Rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Include Upcoming Hours</Label>
              <Input
                type="number"
                value={formData.include_upcoming_hours}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    include_upcoming_hours: parseInt(e.target.value) || 48,
                  })
                }
              />
              <p className="text-xs text-gray-500 mt-1">
                Include bookings starting within this many hours
              </p>
            </div>

            <div>
              <Label>Grace After End Hours</Label>
              <Input
                type="number"
                value={formData.grace_after_end_hours}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    grace_after_end_hours: parseInt(e.target.value) || 12,
                  })
                }
              />
              <p className="text-xs text-gray-500 mt-1">
                Keep vehicles valid for this many hours after booking ends
              </p>
            </div>

            <div>
              <Label>Min Snapshot Plates</Label>
              <Input
                type="number"
                value={formData.min_snapshot_plates}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    min_snapshot_plates: parseInt(e.target.value) || 10,
                  })
                }
              />
              <p className="text-xs text-gray-500 mt-1">
                Minimum number of plates required for snapshot
              </p>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>Allow Small Snapshot Manual</Label>
                <p className="text-xs text-gray-500">
                  Allow manual snapshot even if below minimum
                </p>
              </div>
              <Switch
                checked={formData.allow_small_snapshot_manual}
                onCheckedChange={(checked) =>
                  setFormData({ ...formData, allow_small_snapshot_manual: checked })
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle className="text-sm">Relay Token</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={handleGenerateToken}
              disabled={saving}
            >
              <Key className="h-4 w-4 mr-2" />
              Generate New Relay Token
            </Button>
            <p className="text-sm text-gray-500">
              Generate a new relay token for authentication. The token will only be shown once.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-soft border-blue-200">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Snapshot Generator
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm text-gray-600 mb-3">
              Generate a full snapshot of all active bookings and add them to the ANPR outbox. This will:
            </p>
            <ul className="text-xs text-gray-500 space-y-1 mb-4 list-disc list-inside">
              <li>Scan all bookings with status 'reserved' or 'checked_in'</li>
              <li>Include bookings within ±24 hours of current time</li>
              <li>Create outbox items for each booking with a valid plate number</li>
              <li>Normalize plate numbers (uppercase alphanumeric only)</li>
            </ul>
          </div>
          <Button
            variant="default"
            onClick={handleEmitSnapshot}
            disabled={saving}
            className="w-full sm:w-auto"
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating Snapshot...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Generate Snapshot Now
              </>
            )}
          </Button>
          <p className="text-xs text-gray-500">
            Click to manually trigger snapshot generation. Results will show in the notification.
          </p>
        </CardContent>
      </Card>

      <div className="flex gap-3">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Save Settings'
          )}
        </Button>
      </div>
    </div>
  )
}

