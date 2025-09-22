import { getServerSupabase } from '@/lib/supabase/server'
import { getCurrentTenant } from '@/lib/tenant'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Smartphone, Palette, Upload } from 'lucide-react'

export default async function PWASettingsPage() {
  const supabase = await getServerSupabase()

  let tenant
  try {
    tenant = await getCurrentTenant()
  } catch (error) {
    return (
      <Card className="shadow-soft">
        <CardContent className="p-6">
          <div className="text-center space-y-4">
            <p className="text-gray-600">Tenant Required</p>
            <p className="text-sm text-gray-500">Please complete setup to access PWA settings.</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Get current branding
  const { data: branding } = await supabase
    .from('tenant_branding')
    .select('*')
    .eq('tenant_id', tenant.id)
    .single()

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">PWA Settings</h1>
          <p className="text-sm text-gray-500">Customize your app's appearance and branding.</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Smartphone className="h-4 w-4" />
          Progressive Web App
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* App Information */}
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5" />
              App Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="app_name">App Name</Label>
              <Input 
                id="app_name" 
                defaultValue={branding?.app_name || tenant.name}
                placeholder="My Parking Channel"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="short_name">Short Name</Label>
              <Input 
                id="short_name" 
                defaultValue={branding?.short_name || tenant.slug}
                placeholder="Parking"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="start_url">Start URL</Label>
              <Input 
                id="start_url" 
                defaultValue={branding?.start_url || "/"}
                placeholder="/"
              />
            </div>
          </CardContent>
        </Card>

        {/* Theme Colors */}
        <Card className="shadow-soft">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Palette className="h-5 w-5" />
              Theme Colors
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="theme_color">Theme Color</Label>
              <div className="flex gap-2">
                <Input 
                  id="theme_color" 
                  type="color"
                  defaultValue={branding?.theme_color || "#0B0B0B"}
                  className="w-16 h-10 p-1"
                />
                <Input 
                  defaultValue={branding?.theme_color || "#0B0B0B"}
                  placeholder="#0B0B0B"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="background_color">Background Color</Label>
              <div className="flex gap-2">
                <Input 
                  id="background_color" 
                  type="color"
                  defaultValue={branding?.background_color || "#FFFFFF"}
                  className="w-16 h-10 p-1"
                />
                <Input 
                  defaultValue={branding?.background_color || "#FFFFFF"}
                  placeholder="#FFFFFF"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* App Icons */}
        <Card className="shadow-soft lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              App Icons
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>192x192 Icon</Label>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                    <Smartphone className="h-6 w-6 text-gray-400" />
                  </div>
                  <div className="flex-1">
                    <Input 
                      placeholder="https://your-domain.com/icon-192.png"
                      defaultValue={branding?.icon_192_url || ""}
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>512x512 Icon</Label>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                    <Smartphone className="h-6 w-6 text-gray-400" />
                  </div>
                  <div className="flex-1">
                    <Input 
                      placeholder="https://your-domain.com/icon-512.png"
                      defaultValue={branding?.icon_512_url || ""}
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Maskable Icon (512x512)</Label>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
                    <Smartphone className="h-6 w-6 text-gray-400" />
                  </div>
                  <div className="flex-1">
                    <Input 
                      placeholder="https://your-domain.com/maskable-512.png"
                      defaultValue={branding?.maskable_512_url || ""}
                    />
                  </div>
                </div>
              </div>
            </div>
            <div className="mt-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-700">
                <strong>Tip:</strong> Upload your icons to Supabase Storage and use the public URLs here. 
                Icons should be square PNG files with the specified dimensions.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Separator />

      <div className="flex justify-end">
        <Button className="px-6">
          Save PWA Settings
        </Button>
      </div>
    </div>
  )
}

