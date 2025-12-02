'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { acceptInvite } from './actions';

interface AcceptInviteClientProps {
  invitationId?: string;
  token?: string;
  tenantId?: string;
  tenantSlug?: string;
  tenantName?: string;
  role?: string;
  username?: string;
  error?: string;
}

export default function AcceptInviteClient({
  invitationId,
  token,
  tenantId,
  tenantSlug,
  tenantName,
  role,
  username,
  error,
}: AcceptInviteClientProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(error || null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Auto-accept if we have all the data
    if (invitationId && token && tenantId && !error && !success) {
      handleAccept();
    }
  }, []);

  const handleAccept = async () => {
    if (!invitationId || !token || !tenantId) {
      setMessage('Missing invitation data');
      return;
    }

    setLoading(true);
    setMessage(null);

    const result = await acceptInvite(invitationId, token, tenantId);

    if (result.success) {
      setSuccess(true);
      setMessage('Invitation accepted! Redirecting...');
      // Use full page reload to ensure server sees the updated user_tenants
      setTimeout(() => {
        window.location.href = '/admin';
      }, 1000);
    } else {
      setMessage(result.error);
      setLoading(false);
    }
  };

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <XCircle className="h-5 w-5 text-red-600" />
              Invitation Error
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <Button
              onClick={() => router.push('/login')}
              className="mt-4 w-full"
            >
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              Invitation Accepted
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Alert>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Accept Invitation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {tenantName && (
            <div>
              <p className="text-sm text-gray-600">You've been invited to join:</p>
              <p className="text-lg font-semibold">{tenantName}</p>
            </div>
          )}
          {role && (
            <div>
              <p className="text-sm text-gray-600">Role:</p>
              <p className="font-medium capitalize">{role}</p>
            </div>
          )}
          {username && (
            <div>
              <p className="text-sm text-gray-600">Username:</p>
              <p className="font-medium">{username}</p>
            </div>
          )}

          {message && (
            <Alert variant="destructive">
              <AlertDescription>{message}</AlertDescription>
            </Alert>
          )}

          <Button
            onClick={handleAccept}
            disabled={loading}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Accepting...
              </>
            ) : (
              'Accept Invitation'
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

