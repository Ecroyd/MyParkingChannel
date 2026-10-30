'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Download, KeyRound, Loader2, Copy, Check } from 'lucide-react'
import { toast } from '@/hooks/use-toast'

const DEFAULT_DOWNLOAD_URL =
  'https://github.com/Ecroyd/MyParkingChannel/releases/latest/download/mpc-gateway.exe'

type Pairing = { code: string; expiresAt: string }

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
          departures are recorded automatically. Install it on a computer at the car park that
          stays switched on and is on the same network as the camera recorder.
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
      </CardContent>
    </Card>
  )
}
