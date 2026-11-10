'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, KeyRound, Loader2, Copy, Check } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

const DEFAULT_DOWNLOAD_URL =
  'https://github.com/Ecroyd/MyParkingChannel/releases/latest/download/mpc-gateway.exe'

type Pairing = { code: string; expiresAt: string }

/** What a gateway (0.2.0+) reports with each heartbeat; see gateway/src/engine.ts EngineStatus. */
type GatewayStatus = {
  nvrConnected?: boolean
  lastError?: string | null
  lastRead?: { plate: string; direction: string; at: string; catchUp: boolean } | null
  readsToday?: number
  sentToday?: number
  pending?: number
  lastCatchUp?: { at: string; reads: number; queued: number } | null
  catchUpError?: string | null
  catchUpPending?: boolean
  /** The every-minute search of the NVR's stored reads (0.2.0+). */
  lastSweepAt?: string | null
  sweepError?: string | null
  /** Phase 2 barrier allow-list sync; null when it is off. */
  allowList?: {
    desired: number | null
    lastFetchError: string | null
    cameras: { name: string; plates: number; lastSyncAt: string | null; lastError: string | null }[]
  } | null
}

type GatewayDevice = {
  id: string
  name: string
  kind: string
  last_seen: string | null
  gateway_version?: string | null
  gateway_status?: GatewayStatus | null
}

/** Heartbeats come every 5 minutes; allow for one missed. */
const OFFLINE_AFTER_MS = 11 * 60 * 1000

function ago(iso: string | null | undefined, now: number): string {
  if (!iso) return 'never'
  const mins = Math.round((now - Date.parse(iso)) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hours = Math.round(mins / 60)
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} days ago`
}

const time = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Each paired gateway's health, from its heartbeats: checkable without anyone at the computer. */
function GatewayStatusList({ tenantId }: { tenantId: string }) {
  const [devices, setDevices] = useState<GatewayDevice[] | null>(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`/api/admin/gate-devices?tenantId=${encodeURIComponent(tenantId)}`)
        const json = await res.json().catch(() => ({}))
        if (!cancelled && res.ok) setDevices((json.devices ?? []).filter((d: GatewayDevice) => d.kind === 'anpr'))
      } catch {
        // Keep the last list; the next poll retries.
      }
      if (!cancelled) setNow(Date.now())
    }
    void load()
    const t = setInterval(load, 60_000)
    return () => {
      cancelled = true
      clearInterval(t)
    }
  }, [tenantId])

  if (!devices || devices.length === 0) return null

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-800">Gateways</p>
      {devices.map((d) => {
        const st = d.gateway_status ?? null
        const online = d.last_seen !== null && now - Date.parse(d.last_seen) < OFFLINE_AFTER_MS
        // The live stream or a recent sweep of stored reads both mean the recorder is reachable.
        const swept = Boolean(st?.lastSweepAt && !st.sweepError && Date.parse(d.last_seen ?? '') - Date.parse(st.lastSweepAt) < 3 * 60_000)
        const recorderOk = Boolean(st?.nvrConnected) || swept
        const [label, tone] = !online
          ? ['Offline: computer off or not running', 'bg-gray-100 text-gray-700']
          : st && !recorderOk
            ? ["Can't reach the camera recorder", 'bg-red-100 text-red-800']
            : st
              ? ['Connected and listening', 'bg-emerald-100 text-emerald-800']
              : ['Online', 'bg-emerald-100 text-emerald-800']
        return (
          <div key={d.id} className="rounded-md border p-3 text-sm space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{d.name}</span>
              <span className={`rounded px-2 py-0.5 text-xs ${tone}`}>{label}</span>
              <span className="text-xs text-gray-500">
                Last heard {ago(d.last_seen, now)}
                {d.gateway_version ? ` · v${d.gateway_version}` : ''}
              </span>
            </div>
            {st ? (
              <>
                {!recorderOk && (st.lastError || st.sweepError) && <p className="text-red-700">{st.lastError || st.sweepError}</p>}
                <p className="text-gray-700">
                  Today: {st.readsToday ?? 0} plates · {st.sentToday ?? 0} sent · {st.pending ?? 0} waiting to send
                </p>
                {st.lastRead && (
                  <p className="text-gray-700">
                    Last plate: <b>{st.lastRead.plate}</b> {st.lastRead.direction === 'in' ? 'in' : 'out'} at{' '}
                    {time(st.lastRead.at)}
                    {st.lastRead.catchUp ? ' (caught up)' : ''}
                  </p>
                )}
                {st.catchUpError ? (
                  <p className="text-amber-700">Catching up on missed plates failed: {st.catchUpError}</p>
                ) : st.catchUpPending ? (
                  <p className="text-gray-600">Waiting to catch up on plates missed while it was off.</p>
                ) : st.lastCatchUp ? (
                  <p className="text-gray-600">
                    Last catch-up {time(st.lastCatchUp.at)}: {st.lastCatchUp.reads} plates on the recorder,{' '}
                    {st.lastCatchUp.queued} were new.
                  </p>
                ) : null}
                {st.allowList ? (
                  <div className="text-gray-700">
                    Barrier allow-list: {st.allowList.desired ?? '…'} plates expected
                    {st.allowList.lastFetchError && <span className="text-amber-700"> · {st.allowList.lastFetchError}</span>}
                    {st.allowList.cameras.map((c) => (
                      <div key={c.name} className={c.lastError ? 'text-red-700' : 'text-gray-600'}>
                        {c.name}: {c.plates} on the camera
                        {c.lastError ? ` · ${c.lastError}` : c.lastSyncAt ? ` · synced ${ago(c.lastSyncAt, now)}` : ''}
                      </div>
                    ))}
                  </div>
                ) : (
                  'allowList' in st && <p className="text-gray-500">Barrier allow-list sync is off.</p>
                )}
              </>
            ) : (
              <p className="text-gray-600">This gateway is an older version. Update it to see its status here.</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Set-up for the on-site ANPR gateway app: download it, then type the pairing code into its
 * set-up screen. Pairing creates the gate device and its key; nothing to copy by hand.
 */
export function GatewaySetupCard({ tenantId }: { tenantId: string }) {
  const [pairing, setPairing] = useState<Pairing | null>(null)
  const [downloadUrl, setDownloadUrl] = useState(DEFAULT_DOWNLOAD_URL)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!pairing) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [pairing])

  const secondsLeft = pairing ? Math.max(0, Math.floor((Date.parse(pairing.expiresAt) - now) / 1000)) : 0
  const expired = pairing !== null && secondsLeft === 0

  const getCode = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/anpr/gateway/pairing-code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tenantId }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Could not create a pairing code')
      setPairing({ code: json.code, expiresAt: json.expiresAt })
      if (json.downloadUrl) setDownloadUrl(json.downloadUrl)
      setNow(Date.now())
      setCopied(false)
    } catch (e) {
      toast({ title: 'Pairing code', description: e instanceof Error ? e.message : String(e), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  const copy = async () => {
    if (!pairing) return
    await navigator.clipboard.writeText(pairing.code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Card className="shadow-soft border-emerald-200">
      <CardHeader>
        <CardTitle className="text-sm">On-site gateway</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-gray-600">
          Sends number-plate reads from your cameras to My Parking Channel, so arrivals and
          departures are recorded automatically. Install it on a computer at the car park that is on
          the same network as the camera recorder. It can be switched off at night: when it is back
          on, it catches up on everything the cameras saw, and it keeps itself up to date.
        </p>

        <ol className="text-sm text-gray-700 space-y-1 list-decimal list-inside">
          <li>Download and run the gateway on that computer.</li>
          <li>
            If Windows says it protected your PC, click <b>More info</b> → <b>Run anyway</b>.
          </li>
          <li>Get a pairing code below and type it into the gateway&apos;s set-up page.</li>
        </ol>

        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="default">
            <a href={downloadUrl} rel="noopener">
              <Download className="h-4 w-4 mr-2" />
              Download gateway (Windows)
            </a>
          </Button>
          <Button variant="outline" onClick={getCode} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <KeyRound className="h-4 w-4 mr-2" />}
            {pairing ? 'New pairing code' : 'Get pairing code'}
          </Button>
        </div>

        {pairing && (
          <div className="rounded-md border bg-gray-50 p-4">
            {expired ? (
              <p className="text-sm text-gray-600">This code has expired. Get a new one.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-4">
                <code className="text-2xl font-mono font-semibold tracking-widest">{pairing.code}</code>
                <Button size="sm" variant="outline" onClick={copy}>
                  {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
                <span className="text-xs text-gray-500">
                  Works once · expires in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')}
                </span>
              </div>
            )}
          </div>
        )}

        <GatewayStatusList tenantId={tenantId} />
      </CardContent>
    </Card>
  )
}
