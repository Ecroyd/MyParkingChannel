'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Plus, Edit, Trash2, Settings } from 'lucide-react';
import { toast } from 'react-hot-toast';

type Channel = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  kind: string;
  is_default: boolean;
  is_active: boolean;
  sort_order: number;
};

export default function ChannelsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingChannel, setEditingChannel] = useState<Channel | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    description: '',
    kind: 'generic',
    sort_order: 100,
    is_active: true,
  });

  const loadChannels = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/admin/channels', { credentials: 'include' });
      const result = await response.json();

      if (result.error) {
        toast.error(result.error);
        return;
      }

      setChannels(result.channels || []);
    } catch (error) {
      console.error('Error loading channels:', error);
      toast.error('Failed to load channels');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChannels();
  }, []);

  const handleCreate = () => {
    setEditingChannel(null);
    setFormData({
      name: '',
      code: '',
      description: '',
      kind: 'generic',
      sort_order: 100,
      is_active: true,
    });
    setDialogOpen(true);
  };

  const handleEdit = (channel: Channel) => {
    setEditingChannel(channel);
    setFormData({
      name: channel.name,
      code: channel.code,
      description: channel.description || '',
      kind: channel.kind,
      sort_order: channel.sort_order,
      is_active: channel.is_active,
    });
    setDialogOpen(true);
  };

  const handleDelete = async (channel: Channel) => {
    if (!confirm(`Are you sure you want to delete "${channel.name}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/channels/${channel.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const result = await response.json();

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success('Channel deleted');
      loadChannels();
    } catch (error) {
      console.error('Error deleting channel:', error);
      toast.error('Failed to delete channel');
    }
  };

  const handleSave = async () => {
    if (!formData.name || !formData.code) {
      toast.error('Name and code are required');
      return;
    }

    try {
      const url = editingChannel
        ? `/api/admin/channels/${editingChannel.id}`
        : '/api/admin/channels';
      const method = editingChannel ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success(editingChannel ? 'Channel updated' : 'Channel created');
      setDialogOpen(false);
      loadChannels();
    } catch (error) {
      console.error('Error saving channel:', error);
      toast.error('Failed to save channel');
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center py-8">Loading channels...</div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Channels</h1>
          <p className="text-sm text-gray-500">
            Manage pricing channels for different booking sources (Direct, Web, CAVU, etc.)
          </p>
        </div>
        <Button onClick={handleCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Add Channel
        </Button>
      </div>

      <div className="bg-white rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Code</TableHead>
              <TableHead>Kind</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Active</TableHead>
              <TableHead>Sort Order</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {channels.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                  No channels yet. Create one to get started.
                </TableCell>
              </TableRow>
            ) : (
              channels.map((channel) => (
                <TableRow key={channel.id}>
                  <TableCell className="font-medium">
                    {channel.code === 'cavu' ? (
                      <Link
                        href="/admin/channels/cavu"
                        className="flex items-center gap-2 text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        {channel.name}
                        <Settings className="h-3 w-3" />
                      </Link>
                    ) : (
                      channel.name
                    )}
                  </TableCell>
                  <TableCell>
                    <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                      {channel.code}
                    </code>
                  </TableCell>
                  <TableCell>{channel.kind}</TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {channel.description || '—'}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex px-2 py-1 rounded-full text-xs ${
                        channel.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {channel.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </TableCell>
                  <TableCell>{channel.sort_order}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-2">
                      {channel.code === 'cavu' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                        >
                          <Link href="/admin/channels/cavu">
                            <Settings className="h-4 w-4" />
                          </Link>
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEdit(channel)}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDelete(channel)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="bg-white text-gray-900 max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingChannel ? 'Edit Channel' : 'Create Channel'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. CAVU"
                />
              </div>
              <div>
                <Label htmlFor="code">Code *</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value.toLowerCase() })
                  }
                  placeholder="e.g. cavu"
                  disabled={!!editingChannel}
                  className={editingChannel ? 'bg-gray-100' : ''}
                />
                <p className="text-xs text-gray-500 mt-1">
                  {editingChannel
                    ? 'Code cannot be changed after creation'
                    : 'Lowercase, alphanumeric + underscores only'}
                </p>
              </div>
            </div>

            <div>
              <Label htmlFor="kind">Kind</Label>
              <Select
                value={formData.kind}
                onValueChange={(value) => setFormData({ ...formData, kind: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="direct">Direct</SelectItem>
                  <SelectItem value="web">Web</SelectItem>
                  <SelectItem value="agent">Agent</SelectItem>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="generic">Generic</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                placeholder="e.g. Used for CAVU API bookings"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="sort_order">Sort Order</Label>
                <Input
                  id="sort_order"
                  type="number"
                  value={formData.sort_order}
                  onChange={(e) =>
                    setFormData({ ...formData, sort_order: parseInt(e.target.value) || 100 })
                  }
                />
              </div>
              <div className="flex items-center space-x-2 pt-6">
                <Switch
                  id="is_active"
                  checked={formData.is_active}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_active: checked })
                  }
                />
                <Label htmlFor="is_active">Active</Label>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {editingChannel ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}



