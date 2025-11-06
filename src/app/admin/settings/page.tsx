'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Eye, EyeOff, Lock, CheckCircle, DollarSign } from 'lucide-react'

function PricingSettings() {
  const [pricing, setPricing] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{type: 'success' | 'error', text: string} | null>(null)
  
  const [formData, setFormData] = useState({
    daily_rate: 7.0,
    minute_rate: 0.0049,
    billing_type: 'day' as 'day' | 'minute',
    currency: 'GBP'
  })

  useEffect(() => {
    async function loadPricing() {
      try {
        const response = await fetch('/api/pricing/tenant')
        const result = await response.json()
        
        if (result.success && result.data) {
          setPricing(result.data)
          setFormData({
            daily_rate: result.data.daily_rate || 7.0,
            minute_rate: result.data.minute_rate || (result.data.daily_rate ? result.data.daily_rate / (24 * 60) : 0.0049),
            billing_type: result.data.billing_type || 'day',
            currency: result.data.currency || 'GBP'
          })
        }
      } catch (err) {
        console.error('Load pricing error:', err)
        setMessage({ type: 'error', text: 'Failed to load pricing settings' })
      } finally {
        setLoading(false)
      }
    }
    
    loadPricing()
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage(null)

    try {
      const response = await fetch('/api/pricing/tenant', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData)
      })

      const result = await response.json()

      if (!result.success) {
        setMessage({ type: 'error', text: result.error || 'Failed to update pricing settings' })
      } else {
        setMessage({ type: 'success', text: 'Pricing settings updated successfully!' })
        setPricing(result.data)
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'An error occurred while updating pricing settings' })
    } finally {
      setSaving(false)
    }
  }

  const handleBillingTypeChange = (type: 'day' | 'minute') => {
    setFormData(prev => {
      if (type === 'minute' && prev.daily_rate) {
        // Calculate minute_rate from daily_rate
        return {
          ...prev,
          billing_type: type,
          minute_rate: prev.daily_rate / (24 * 60)
        }
      } else if (type === 'day' && prev.minute_rate) {
        // Calculate daily_rate from minute_rate
        return {
          ...prev,
          billing_type: type,
          daily_rate: prev.minute_rate * (24 * 60)
        }
      }
      return { ...prev, billing_type: type }
    })
  }

  const handleDailyRateChange = (value: string) => {
    const rate = parseFloat(value) || 0
    setFormData(prev => ({
      ...prev,
      daily_rate: rate,
      ...(prev.billing_type === 'minute' && { minute_rate: rate / (24 * 60) })
    }))
  }

  const handleMinuteRateChange = (value: string) => {
    const rate = parseFloat(value) || 0
    setFormData(prev => ({
      ...prev,
      minute_rate: rate,
      ...(prev.billing_type === 'day' && { daily_rate: rate * (24 * 60) })
    }))
  }

  if (loading) {
    return (
      <Card className="shadow-soft">
        <CardContent className="p-6">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading pricing settings...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="shadow-soft">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <DollarSign className="h-4 w-4" />
          Pricing Configuration
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSave} className="space-y-4">
          {message && (
            <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
              <AlertDescription className="flex items-center gap-2">
                {message.type === 'success' && <CheckCircle className="h-4 w-4" />}
                {message.text}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label>Billing Type</Label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="billing_type"
                  value="day"
                  checked={formData.billing_type === 'day'}
                  onChange={() => handleBillingTypeChange('day')}
                />
                <span>Per Day</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="billing_type"
                  value="minute"
                  checked={formData.billing_type === 'minute'}
                  onChange={() => handleBillingTypeChange('minute')}
                />
                <span>Per Minute</span>
              </label>
            </div>
            <p className="text-xs text-gray-500">
              {formData.billing_type === 'day' 
                ? 'Bookings will be charged per day (24 hours)'
                : 'Bookings will be charged per minute for precise billing'}
            </p>
          </div>

          {formData.billing_type === 'day' ? (
            <div className="space-y-2">
              <Label htmlFor="daily_rate">Daily Rate (£)</Label>
              <Input
                id="daily_rate"
                type="number"
                step="0.01"
                min="0"
                value={formData.daily_rate}
                onChange={(e) => handleDailyRateChange(e.target.value)}
                placeholder="7.00"
                required
              />
              <p className="text-xs text-gray-500">
                Equivalent: £{(formData.daily_rate / (24 * 60)).toFixed(4)} per minute
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="minute_rate">Minute Rate (£)</Label>
              <Input
                id="minute_rate"
                type="number"
                step="0.0001"
                min="0"
                value={formData.minute_rate.toFixed(4)}
                onChange={(e) => handleMinuteRateChange(e.target.value)}
                placeholder="0.0049"
                required
              />
              <p className="text-xs text-gray-500">
                Equivalent: £{(formData.minute_rate * (24 * 60)).toFixed(2)} per day
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="currency">Currency</Label>
            <select
              id="currency"
              value={formData.currency}
              onChange={(e) => setFormData(prev => ({ ...prev, currency: e.target.value }))}
              className="w-full rounded-xl border bg-white/70 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
            >
              <option value="GBP">GBP (£)</option>
              <option value="USD">USD ($)</option>
              <option value="EUR">EUR (€)</option>
            </select>
          </div>

          <Button 
            type="submit" 
            disabled={saving}
            className="w-full"
          >
            {saving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Saving...
              </>
            ) : (
              'Save Pricing Settings'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null)
  const [tenant, setTenant] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  
  // Password change state
  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })
  const [showPasswords, setShowPasswords] = useState({
    current: false,
    new: false,
    confirm: false
  })
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState<{type: 'success' | 'error', text: string} | null>(null)

  const router = useRouter()

  useEffect(() => {
    async function loadData() {
      try {
        const response = await fetch('/api/admin/settings/data');
        const result = await response.json();

        if (!result.success) {
          setError(result.error || 'Failed to load settings data');
          setLoading(false);
          return;
        }

        setUser(result.user);
        setTenant(result.tenant);
        setLoading(false);
      } catch (err) {
        console.error('Load data error:', err);
        setError('Failed to load data');
        setLoading(false);
      }
    }

    loadData();
  }, [])

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    setPasswordLoading(true)
    setPasswordMessage(null)

    try {
      // Validate passwords match
      if (passwordData.newPassword !== passwordData.confirmPassword) {
        setPasswordMessage({ type: 'error', text: 'New passwords do not match' })
        return
      }

      // Validate password length
      if (passwordData.newPassword.length < 6) {
        setPasswordMessage({ type: 'error', text: 'Password must be at least 6 characters long' })
        return
      }

      // Update password using API endpoint
      const response = await fetch('/api/admin/settings/password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          currentPassword: passwordData.currentPassword,
          newPassword: passwordData.newPassword
        })
      })

      const result = await response.json()

      if (!result.success) {
        setPasswordMessage({ type: 'error', text: result.error || 'Failed to update password' })
      } else {
        setPasswordMessage({ type: 'success', text: 'Password updated successfully!' })
        setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' })
      }
    } catch (err) {
      setPasswordMessage({ type: 'error', text: 'An error occurred while updating password' })
    } finally {
      setPasswordLoading(false)
    }
  }

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

  // TODO: load tenant + members for current tenant
  const members: any[] = [{ email: user?.email, role: 'owner' }]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-gray-500">Manage your business profile and team.</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="billing" disabled>Billing</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="pt-4">
          {/* Business Profile */}
          <Card className="shadow-soft">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Business Profile</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 md:grid-cols-3">
              <div>
                <Label>Name</Label>
                <Input defaultValue={tenant.name} />
              </div>
              <div>
                <Label>Slug</Label>
                <Input defaultValue={tenant.slug} />
              </div>
              <div>
                <Label>Timezone</Label>
                <Input defaultValue={tenant.timezone} />
              </div>
              <div className="md:col-span-3">
                <Button>Save changes</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pricing" className="pt-4">
          <PricingSettings />
        </TabsContent>

        <TabsContent value="security" className="pt-4">
          {/* Password Change */}
          <Card className="shadow-soft">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Lock className="h-4 w-4" />
                Change Password
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePasswordChange} className="space-y-4">
                {passwordMessage && (
                  <Alert variant={passwordMessage.type === 'error' ? 'destructive' : 'default'}>
                    <AlertDescription className="flex items-center gap-2">
                      {passwordMessage.type === 'success' && <CheckCircle className="h-4 w-4" />}
                      {passwordMessage.text}
                    </AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="newPassword">New Password</Label>
                  <div className="relative">
                    <Input
                      id="newPassword"
                      type={showPasswords.new ? "text" : "password"}
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData({...passwordData, newPassword: e.target.value})}
                      placeholder="Enter new password"
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords({...showPasswords, new: !showPasswords.new})}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {showPasswords.new ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm New Password</Label>
                  <div className="relative">
                    <Input
                      id="confirmPassword"
                      type={showPasswords.confirm ? "text" : "password"}
                      value={passwordData.confirmPassword}
                      onChange={(e) => setPasswordData({...passwordData, confirmPassword: e.target.value})}
                      placeholder="Confirm new password"
                      required
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPasswords({...showPasswords, confirm: !showPasswords.confirm})}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
                    >
                      {showPasswords.confirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <Button 
                  type="submit" 
                  disabled={passwordLoading}
                  className="w-full"
                >
                  {passwordLoading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Updating...
                    </>
                  ) : (
                    'Update Password'
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
        </TabsContent>


        <TabsContent value="members" className="pt-4">
          <Card className="shadow-soft">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Team Members</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {members.map((m,i)=>(
                <div key={i} className="flex items-center justify-between border rounded-xl p-3">
                  <div>
                    <div className="text-sm">{m.email}</div>
                    <div className="text-xs text-gray-500">{m.role}</div>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline">Make admin</Button>
                    <Button size="sm" variant="outline">Remove</Button>
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <Input placeholder="Invite by email" />
                <Button>Invite</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
