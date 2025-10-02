'use client'

/**
 * UploadTenantLogo Component
 * 
 * Uploads tenant logos to Supabase Storage and displays them in the admin interface.
 * 
 * Storage Requirements:
 * - Bucket: 'tenant-assets' (must be created in Supabase Storage)
 * - Path: '{tenantId}/logo.png'
 * - RLS: Should allow authenticated users to upload/delete their tenant's assets
 * - Public access: Enabled for the bucket to allow public URL generation
 * 
 * Usage:
 * <UploadTenantLogo 
 *   tenantId={tenant.id} 
 *   currentLogoUrl={tenant.brand_logo_url}
 *   onLogoUpdated={(logoUrl) => setTenant(prev => ({ ...prev, brand_logo_url: logoUrl }))}
 * />
 */

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Upload, Image, X } from 'lucide-react'
import { toast } from 'sonner'

interface UploadTenantLogoProps {
  tenantId: string
  currentLogoUrl?: string
  onLogoUpdated?: (logoUrl: string) => void
}

export function UploadTenantLogo({ tenantId, currentLogoUrl, onLogoUpdated }: UploadTenantLogoProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(currentLogoUrl || null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)


  // Load existing logo on mount
  useEffect(() => {
    if (currentLogoUrl) {
      setLogoUrl(currentLogoUrl)
    }
  }, [currentLogoUrl])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Guard clause: ensure tenantId is available
    if (!tenantId) {
      setError('Tenant ID not available')
      toast.error('Tenant information is still loading. Please wait and try again.')
      return
    }

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB')
      return
    }

    setUploading(true)
    setError(null)

    // Create preview
    const preview = URL.createObjectURL(file)
    setPreviewUrl(preview)

    try {
      // Upload using API endpoint
      const formData = new FormData()
      formData.append('file', file)
      formData.append('tenantId', tenantId)

      const response = await fetch('/api/admin/logo/upload', {
        method: 'POST',
        body: formData,
      })

      const result = await response.json()

      console.log('Upload result:', result)

      if (!result.success) {
        setError(result.error || 'Upload failed')
        setPreviewUrl(null)
        toast.error(result.error || 'Upload failed')
      } else {
        console.log('Setting new logo URL:', result.logoUrl)
        setLogoUrl(result.logoUrl)
        setPreviewUrl(null)
        onLogoUpdated?.(result.logoUrl)
        toast.success('Logo uploaded successfully!')
      }
    } catch (err) {
      console.error('Upload exception:', err)
      setError('Upload failed. Please try again.')
      setPreviewUrl(null)
      toast.error('Upload failed. Please try again.')
    }

    setUploading(false)
  }

  async function handleRemove() {
    if (!logoUrl) return

    // Guard clause: ensure tenantId is available
    if (!tenantId) {
      setError('Tenant ID not available')
      toast.error('Tenant information is still loading. Please wait and try again.')
      return
    }

    setUploading(true)
    setError(null)

    try {
      // Delete using API endpoint
      const response = await fetch(`/api/admin/logo/upload?tenantId=${tenantId}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (!result.success) {
        setError(result.error || 'Failed to remove logo')
        toast.error(result.error || 'Failed to remove logo')
      } else {
        setLogoUrl(null)
        onLogoUpdated?.('')
        toast.success('Logo removed successfully!')
      }
    } catch (err) {
      setError('Failed to remove logo. Please try again.')
      toast.error('Failed to remove logo. Please try again.')
    }

    setUploading(false)
  }

  return (
    <Card className="shadow-soft">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Image className="h-4 w-4" />
          Business Logo
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current Logo Display */}
        {(logoUrl || previewUrl) && (
          <div className="flex items-center gap-4">
            <div className="relative">
              <img
                src={previewUrl || logoUrl || ''}
                alt="Business Logo"
                className="w-20 h-20 object-contain border rounded-lg bg-gray-50"
              />
              {!uploading && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRemove}
                  className="absolute -top-2 -right-2 h-6 w-6 p-0 bg-red-500 hover:bg-red-600 text-white rounded-full"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            <div className="text-sm text-gray-600">
              <p className="font-medium">Current logo</p>
              <p className="text-xs">Recommended: 200x200px, PNG or JPG</p>
            </div>
          </div>
        )}

        {/* Upload Section */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept="image/*"
              onChange={handleUpload}
              disabled={uploading || !tenantId}
              className="hidden"
              id="logo-upload"
            />
            <label
              htmlFor="logo-upload"
              className={`flex items-center gap-2 px-4 py-2 border rounded-lg transition-colors ${
                uploading || !tenantId
                  ? 'bg-gray-100 cursor-not-allowed' 
                  : 'bg-white hover:bg-gray-50 border-gray-300 cursor-pointer'
              }`}
            >
              <Upload className="h-4 w-4" />
              {!tenantId 
                ? 'Loading...' 
                : uploading 
                  ? 'Uploading...' 
                  : (logoUrl ? 'Replace Logo' : 'Upload Logo')
              }
            </label>
          </div>

          {/* Error Display */}
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
              {error}
            </div>
          )}

          {/* Loading State Message */}
          {!tenantId && !error && (
            <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
              ⚠️ Loading tenant information... Please wait for the page to finish loading.
            </div>
          )}

          {/* Upload Guidelines */}
          <div className="text-xs text-gray-500 space-y-1">
            <p>• Supported formats: PNG, JPG, GIF, WebP</p>
            <p>• Maximum file size: 5MB</p>
            <p>• Recommended dimensions: 200x200px or larger</p>
            <p>• Logo will be displayed on your tenant site and admin interface</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
