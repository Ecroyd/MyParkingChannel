'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Eye, EyeOff, Lock, CheckCircle } from 'lucide-react'

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

      // Update password using Supabase auth
      const { error } = await supabase.auth.updateUser({
        password: passwordData.newPassword
      })

      if (error) {
        setPasswordMessage({ type: 'error', text: error.message })
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

  // TODO: load tenant + domains + members for current tenant
  const domains: any[] = [{ domain: `${tenant.slug}.localhost:3002`, is_primary: true }]
  const members: any[] = [{ email: user?.email, role: 'owner' }]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold">Settings</h1>
        <p className="text-sm text-gray-500">Manage your business profile, domains and team.</p>
      </div>

      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="domains">Domains</TabsTrigger>
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

        <TabsContent value="domains" className="pt-4">
          <Card className="shadow-soft">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Domains</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {domains.map((d, i) => (
                <div key={i} className="flex items-center justify-between border rounded-xl p-3">
                  <div className="text-sm">{d.domain}</div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={d.is_primary}>Set primary</Button>
                    <Button size="sm" variant="outline">Remove</Button>
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <Input placeholder="Add domain e.g. mybrand.com" />
                <Button>Add</Button>
              </div>
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
