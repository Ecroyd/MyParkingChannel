'use client'

import { useState, useEffect } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import EmptyState from '@/components/admin/EmptyState'
import { Upload, ArrowRight, FileText } from 'lucide-react'
import Link from 'next/link'

type Step = 1 | 2 | 3 | 4

export default function UploadsPage() {
  const [step, setStep] = useState<Step>(1)
  const [file, setFile] = useState<File | null>(null)
  const [user, setUser] = useState<any>(null)
  const [tenant, setTenant] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()

  useEffect(() => {
    async function loadData() {
      try {
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user) {
          setError('Not authenticated')
          setLoading(false)
          return
        }

        setUser(user)

        // Get user's tenants (following the same pattern as other admin pages)
        const { data: userTenants, error: tenantError } = await supabase
          .from('user_tenants')
          .select(`
            tenant_id,
            role,
            is_default,
            tenants (
              id,
              name,
              slug,
              timezone
            )
          `)
          .eq('user_id', user.id)

        if (tenantError) {
          setError('Failed to load tenant data')
          setLoading(false)
          return
        }

        if (!userTenants || userTenants.length === 0) {
          setError('No tenant access found')
          setLoading(false)
          return
        }

        // Find the default tenant or use the first one
        const userTenant = userTenants.find(ut => ut.is_default) || userTenants[0]
        setTenant(userTenant?.tenants)
        setLoading(false)
      } catch (err) {
        console.error('Load data error:', err)
        setError('Failed to load data')
        setLoading(false)
      }
    }

    loadData()
  }, [])

  if (loading) {
    return (
      <Card className="shadow-soft">
        <CardContent className="p-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className="shadow-soft">
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <p className="text-red-600">{error}</p>
            <Button onClick={() => router.push('/admin/setup')} className="w-full">
              Go to Setup
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!tenant) {
    return (
      <Card className="shadow-soft">
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <p className="text-gray-600">Tenant Required</p>
            <p className="text-sm text-gray-500">Please specify a tenant to access the admin dashboard.</p>
            <Button onClick={() => router.push('/admin/setup')} className="w-full">
              Go to Setup
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Uploads</h1>
        <p className="text-sm text-gray-500">Import bookings via CSV or Excel.</p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card className="shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-4 w-4" />
              CSV Import
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              Import bookings from CSV files with automatic column detection and validation.
            </p>
            <Link href="/admin/bookings/upload">
              <Button className="w-full">
                <FileText className="h-4 w-4 mr-2" />
                Import CSV
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card className="shadow-soft">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Excel Import
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-gray-600">
              Advanced Excel import with column mapping and validation (coming soon).
            </p>
            <Button disabled className="w-full">
              <Upload className="h-4 w-4 mr-2" />
              Import Excel
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-soft">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Legacy Upload Wizard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 1 && (
            <div className="space-y-3">
              <Input type="file" accept=".csv,.xlsx" onChange={(e)=>setFile(e.target.files?.[0] ?? null)} />
              <Button disabled={!file} onClick={()=>setStep(2)}><Upload className="h-4 w-4 mr-2" /> Upload</Button>
            </div>
          )}
          {step === 2 && (
            <EmptyState title="Map Columns" detail="Match your columns to reference, customer_name, email, plate, start_at, end_at." action={<Button onClick={()=>setStep(3)}>Continue <ArrowRight className="h-4 w-4 ml-1" /></Button>} />
          )}
          {step === 3 && (
            <EmptyState title="Validate" detail="We'll show parsing errors here." action={<Button onClick={()=>setStep(4)}>Preview & Commit</Button>} />
          )}
          {step === 4 && (
            <EmptyState title="Preview & Commit" detail="Show diff summary (new vs update). Commit will call /api/bookings/upload." action={<Button>Commit Import</Button>} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

