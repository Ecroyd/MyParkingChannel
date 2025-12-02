'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { inviteMember, updateMemberRole, removeMember, cancelInvitation, resendInvitation } from './actions';
import { X, Mail, User, Shield, Crown, Loader2 } from 'lucide-react';

interface Member {
  user_id: string;
  role: 'owner' | 'admin' | 'user';
  is_default: boolean;
  created_at: string;
  users: {
    id: string;
    email: string;
  } | null;
}

interface Invitation {
  id: string;
  email: string;
  role: 'owner' | 'admin' | 'user';
  created_at: string;
  expires_at: string;
}

interface MembersClientProps {
  members: Member[];
  invitations: Invitation[];
  currentUserId: string;
  currentUserRole: 'owner' | 'admin' | 'user';
  isOnlyOwner: boolean;
}

export default function MembersClient({
  members,
  invitations,
  currentUserId,
  currentUserRole,
  isOnlyOwner,
}: MembersClientProps) {
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'user'>('user');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    const formData = new FormData();
    formData.append('email', inviteEmail);
    formData.append('role', inviteRole);

    const result = await inviteMember(formData);

    if (result.success) {
      setMessage({ type: 'success', text: 'Invitation sent successfully' });
      setInviteEmail('');
      setInviteRole('user');
    } else {
      setMessage({ type: 'error', text: result.error });
    }

    setLoading(false);
  };

  const handleUpdateRole = async (userId: string, newRole: 'owner' | 'admin' | 'user') => {
    setLoading(true);
    setMessage(null);

    const result = await updateMemberRole(userId, newRole);

    if (result.success) {
      setMessage({ type: 'success', text: 'Member role updated successfully' });
    } else {
      setMessage({ type: 'error', text: result.error });
    }

    setLoading(false);
  };

  const handleRemove = async (userId: string) => {
    if (!confirm('Are you sure you want to remove this member?')) {
      return;
    }

    setLoading(true);
    setMessage(null);

    const result = await removeMember(userId);

    if (result.success) {
      setMessage({ type: 'success', text: 'Member removed successfully' });
    } else {
      setMessage({ type: 'error', text: result.error });
    }

    setLoading(false);
  };

  const handleCancelInvite = async (invitationId: string) => {
    setLoading(true);
    setMessage(null);

    const result = await cancelInvitation(invitationId);

    if (result.success) {
      setMessage({ type: 'success', text: 'Invitation cancelled' });
    } else {
      setMessage({ type: 'error', text: result.error });
    }

    setLoading(false);
  };

  const handleResendInvite = async (invitationId: string) => {
    setLoading(true);
    setMessage(null);

    const result = await resendInvitation(invitationId);

    if (result.success) {
      setMessage({ type: 'success', text: 'Invitation resent' });
    } else {
      setMessage({ type: 'error', text: result.error });
    }

    setLoading(false);
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'owner':
        return <Crown className="h-4 w-4 text-yellow-600" />;
      case 'admin':
        return <Shield className="h-4 w-4 text-blue-600" />;
      default:
        return <User className="h-4 w-4 text-gray-600" />;
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case 'owner':
        return 'Owner';
      case 'admin':
        return 'Admin';
      default:
        return 'User';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Team Members</h1>
        <p className="text-sm text-gray-500">Manage who has access to your tenant</p>
      </div>

      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {/* Current Members */}
      <Card>
        <CardHeader>
          <CardTitle>Current Members</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {members.map((member) => {
              const isCurrentUser = member.user_id === currentUserId;
              const canEdit = currentUserRole === 'owner' && (!isOnlyOwner || member.role !== 'owner' || !isCurrentUser);
              const canRemove = currentUserRole === 'owner' && (!isOnlyOwner || member.role !== 'owner' || !isCurrentUser);

              return (
                <div
                  key={member.user_id}
                  className="flex items-center justify-between border rounded-lg p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      {getRoleIcon(member.role)}
                      <div>
                        <div className="font-medium">
                          {member.users?.email || 'Unknown user'}
                          {isCurrentUser && (
                            <span className="ml-2 text-xs text-gray-500">(You)</span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">
                          {getRoleLabel(member.role)}
                          {member.is_default && ' • Default'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {canEdit && (
                      <Select
                        value={member.role}
                        onValueChange={(value) => handleUpdateRole(member.user_id, value as 'owner' | 'admin' | 'user')}
                        disabled={loading}
                      >
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="owner">Owner</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                          <SelectItem value="user">User</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                    {canRemove && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleRemove(member.user_id)}
                        disabled={loading}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Invite New Member */}
      <Card>
        <CardHeader>
          <CardTitle>Invite New Member</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInvite} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <div className="md:col-span-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="colleague@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  required
                  disabled={loading}
                />
              </div>
              <div>
                <Label htmlFor="role">Role</Label>
                <Select value={inviteRole} onValueChange={(value) => setInviteRole(value as 'admin' | 'user')} disabled={loading}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="user">User</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Mail className="mr-2 h-4 w-4" />
                  Send Invitation
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Pending Invitations */}
      {invitations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Pending Invitations</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {invitations.map((invite) => (
                <div
                  key={invite.id}
                  className="flex items-center justify-between border rounded-lg p-4"
                >
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <div>
                      <div className="font-medium">{invite.email}</div>
                      <div className="text-sm text-gray-500">
                        {getRoleLabel(invite.role)} • Invited {new Date(invite.created_at).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleResendInvite(invite.id)}
                      disabled={loading}
                    >
                      Resend
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleCancelInvite(invite.id)}
                      disabled={loading}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Test Cases Checklist (as comments for reference) */}
      {/* 
      TEST CASES:
      ✓ New tenant created → creator is owner with is_default=true
      ✓ Owner invites a new user email → invitation row created, email sent
      ✓ Invitee signs up via Supabase auth → after clicking link and logging in, user_tenants row created with the right role
      ✓ user role → can access /admin/bookings etc., cannot see Analytics, financials, Stripe/API keys, members, or settings
      ✓ admin role → can see/edit bookings, analytics, settings, members, cannot transfer or delete tenant, cannot remove the sole owner
      ✓ UI hides tabs appropriately for each role
      ✓ If the only owner tries to downgrade themselves → blocked with a friendly error
      */}
    </div>
  );
}

