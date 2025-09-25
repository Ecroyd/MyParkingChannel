'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Save, ArrowLeft, Trash2, Key, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';

type Tenant = {
  id: string;
  name: string;
  slug: string;
  timezone: string | null;
  default_capacity: number | null;
  created_at: string;
};

type Member = {
  user_id: string;
  role: string;
  email?: string;
};

interface EditTenantClientProps {
  tenant: Tenant;
  members: Member[];
  ownerContactInfo?: {
    user_id: string;
    email: string;
    phone: string;
  } | null;
}

export default function EditTenantClient({ tenant, members, ownerContactInfo }: EditTenantClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  // Get the owner email for password management
  const ownerEmail = members.find(m => m.role === 'owner')?.email;
  
  // Debug: Log the members data
  console.log('Members data:', members);
  console.log('Owner email:', ownerEmail);

  const [formData, setFormData] = useState({
    name: tenant.name,
    slug: tenant.slug,
    timezone: tenant.timezone || 'UTC',
    default_capacity: tenant.default_capacity?.toString() || '100',
    ownerEmail: ownerContactInfo?.email || ownerEmail || '',
    ownerPhone: ownerContactInfo?.phone || '',
  });

  // Password management state
  const [passwordData, setPasswordData] = useState({
    password: '',
    confirmPassword: '',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSave = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/tenants/${tenant.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: formData.name,
          slug: formData.slug,
          timezone: formData.timezone,
          default_capacity: parseInt(formData.default_capacity),
          ownerEmail: formData.ownerEmail,
          ownerPhone: formData.ownerPhone,
        }),
      });

      if (response.ok) {
        router.push('/admin/tenants');
      } else {
        const errorText = await response.text();
        console.error('Failed to update tenant. Status:', response.status);
        console.error('Response text:', errorText);
        
        let errorMessage = 'Unknown error';
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorData.message || errorText;
        } catch {
          errorMessage = errorText || `HTTP ${response.status}`;
        }
        
        alert(`Failed to update tenant: ${errorMessage}`);
      }
    } catch (error) {
      console.error('Error updating tenant:', error);
      alert('Error updating tenant');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this tenant? This action cannot be undone.')) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/admin/tenants/${tenant.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        router.push('/admin/tenants');
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to delete tenant:', errorData);
        alert(`Failed to delete tenant: ${errorData.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('Error deleting tenant:', error);
      alert('Error deleting tenant');
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async () => {
    if (!passwordData.password || !passwordData.confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Please enter both password fields' });
      return;
    }

    if (passwordData.password !== passwordData.confirmPassword) {
      setPasswordMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }

    if (passwordData.password.length < 6) {
      setPasswordMessage({ type: 'error', text: 'Password must be at least 6 characters' });
      return;
    }

    const fallbackEmailForPassword = members.length > 0 ? (members[0]?.email || formData.ownerEmail) : formData.ownerEmail;
    const emailToUse = ownerEmail || formData.ownerEmail || fallbackEmailForPassword;
    if (!emailToUse) {
      setPasswordMessage({ type: 'error', text: 'No email found for this tenant. Please enter an owner email above and save first.' });
      return;
    }

    setPasswordLoading(true);
    setPasswordMessage(null);

    try {
      const response = await fetch(`/api/admin/tenants/${tenant.id}/set-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password: passwordData.password,
          email: emailToUse,
        }),
      });

      if (response.ok) {
        setPasswordMessage({ type: 'success', text: 'Password set successfully! The owner can now log in.' });
        setPasswordData({ password: '', confirmPassword: '' });
      } else {
        const errorData = await response.json().catch(() => ({}));
        setPasswordMessage({ type: 'error', text: errorData.error || 'Failed to set password' });
      }
    } catch (error) {
      console.error('Error setting password:', error);
      setPasswordMessage({ type: 'error', text: 'Error setting password' });
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link href="/admin/tenants">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Tenants
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">Edit Tenant</h1>
            <p className="text-gray-600">Update tenant information</p>
          </div>
        </div>
        <Button
          variant="destructive"
          onClick={handleDelete}
          disabled={loading}
        >
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
          Delete Tenant
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tenant Details */}
        <Card>
          <CardHeader>
            <CardTitle>Tenant Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="Tenant name"
              />
            </div>

            <div>
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={formData.slug}
                onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                placeholder="tenant-slug"
              />
            </div>

            <div>
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                id="timezone"
                value={formData.timezone}
                onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                placeholder="UTC"
              />
            </div>

            <div>
              <Label htmlFor="capacity">Default Capacity</Label>
              <Input
                id="capacity"
                type="number"
                value={formData.default_capacity}
                onChange={(e) => setFormData({ ...formData, default_capacity: e.target.value })}
                placeholder="100"
              />
            </div>

            <div>
              <Label htmlFor="ownerEmail">Owner Email</Label>
              <Input
                id="ownerEmail"
                type="email"
                value={formData.ownerEmail}
                onChange={(e) => setFormData({ ...formData, ownerEmail: e.target.value })}
                placeholder="owner@example.com"
              />
              <p className="text-xs text-gray-500 mt-1">
                Email address for the tenant owner. This user will be able to log in and manage the tenant.
              </p>
            </div>

            <div>
              <Label htmlFor="ownerPhone">Owner Phone (Optional)</Label>
              <Input
                id="ownerPhone"
                type="tel"
                value={formData.ownerPhone}
                onChange={(e) => setFormData({ ...formData, ownerPhone: e.target.value })}
                placeholder="+44 1234 567890"
              />
              <p className="text-xs text-gray-500 mt-1">
                Phone number for the tenant owner (optional).
              </p>
            </div>

            <Button onClick={handleSave} disabled={loading} className="w-full">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Changes
            </Button>
          </CardContent>
        </Card>

        {/* Password Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="h-5 w-5" />
              Password Management
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>Owner Email:</strong> {ownerEmail || 'No owner found'}
              </p>
              {formData.ownerEmail && !ownerEmail && (
                <p className="text-sm text-blue-800">
                  <strong>Form Email:</strong> {formData.ownerEmail}
                </p>
              )}
              {(() => {
                const fallbackEmailForDisplay = members.length > 0 ? (members[0]?.email || formData.ownerEmail) : formData.ownerEmail;
                return fallbackEmailForDisplay && !ownerEmail && !formData.ownerEmail && (
                  <p className="text-sm text-blue-800">
                    <strong>Fallback Email:</strong> {fallbackEmailForDisplay}
                  </p>
                );
              })()}
              <p className="text-xs text-blue-600 mt-1">
                Set a password for the tenant user to log in
              </p>
              {(() => {
                const fallbackEmailForError = members.length > 0 ? (members[0]?.email || formData.ownerEmail) : formData.ownerEmail;
                return !ownerEmail && !formData.ownerEmail && !fallbackEmailForError && (
                  <p className="text-xs text-red-600 mt-1">
                    ⚠️ No email found. Please enter an owner email above and save, or ensure the tenant has members assigned.
                  </p>
                );
              })()}
            </div>

            {passwordMessage && (
              <Alert variant={passwordMessage.type === 'error' ? 'destructive' : 'default'}>
                <AlertDescription>{passwordMessage.text}</AlertDescription>
              </Alert>
            )}

            <div>
              <Label htmlFor="password">New Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={passwordData.password}
                  onChange={(e) => setPasswordData({ ...passwordData, password: e.target.value })}
                  placeholder="Enter new password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div>
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={passwordData.confirmPassword}
                onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                placeholder="Confirm new password"
              />
            </div>

            <Button 
              onClick={handleSetPassword} 
              disabled={passwordLoading} 
              className="w-full"
            >
              {passwordLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Key className="mr-2 h-4 w-4" />
              )}
              Set Owner Password
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Tenant Members */}
        <Card>
          <CardHeader>
            <CardTitle>Team Members</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {members.map((member) => (
                <div key={member.user_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div>
                    <p className="font-medium">{member.email || 'No email available'}</p>
                    <p className="text-sm text-gray-600">User ID: {member.user_id}</p>
                  </div>
                  <Badge variant={member.role === 'owner' ? 'default' : 'secondary'}>
                    {member.role}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tenant Info */}
      <Card>
        <CardHeader>
          <CardTitle>Tenant Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium text-gray-500">Tenant ID</Label>
              <p className="text-sm font-mono bg-gray-100 p-2 rounded">{tenant.id}</p>
            </div>
            <div>
              <Label className="text-sm font-medium text-gray-500">Created</Label>
              <p className="text-sm">{new Date(tenant.created_at).toLocaleDateString()}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
