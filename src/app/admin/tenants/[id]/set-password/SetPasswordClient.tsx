'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import Link from 'next/link';

type Tenant = {
  id: string;
  name: string;
  slug: string;
};

interface SetPasswordClientProps {
  tenant: Tenant;
  ownerEmail: string;
}

export default function SetPasswordClient({ tenant, ownerEmail }: SetPasswordClientProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSetPassword = async () => {
    if (!password || !confirmPassword) {
      setMessage({ type: 'error', text: 'Please enter both password fields' });
      return;
    }

    if (password !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match' });
      return;
    }

    if (password.length < 6) {
      setMessage({ type: 'error', text: 'Password must be at least 6 characters' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/tenants/${tenant.id}/set-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          password,
          email: ownerEmail,
        }),
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Password set successfully! The owner can now log in.' });
        setPassword('');
        setConfirmPassword('');
      } else {
        const errorData = await response.json().catch(() => ({}));
        setMessage({ type: 'error', text: errorData.error || 'Failed to set password' });
      }
    } catch (error) {
      console.error('Error setting password:', error);
      setMessage({ type: 'error', text: 'Error setting password' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center space-x-4">
        <Link href={`/admin/tenants/${tenant.id}`}>
          <Button variant="outline">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Tenant
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Set Password for {tenant.name}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Set Owner Password</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-600">Owner Email</label>
            <p className="text-sm text-gray-900 mt-1 font-mono bg-gray-100 px-2 py-1 rounded">
              {ownerEmail}
            </p>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-600">New Password</label>
            <div className="relative mt-1">
              <Input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter new password"
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500 hover:text-gray-700"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-600">Confirm Password</label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm new password"
              className="mt-1"
            />
          </div>

          {message && (
            <div className={`p-3 rounded-md ${
              message.type === 'success' 
                ? 'bg-green-50 text-green-800 border border-green-200' 
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {message.text}
            </div>
          )}

          <Button onClick={handleSetPassword} disabled={loading} className="w-full">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Set Password
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Login Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div>
            <label className="text-sm font-medium text-gray-600">Login URL</label>
            <p className="text-sm text-gray-900">
              <a 
                href={`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3002'}/login`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                {process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3002'}/login
              </a>
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-600">Email</label>
            <p className="text-sm text-gray-900 font-mono">{ownerEmail}</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
