'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Copy, Percent, Save } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface LosRow {
  days: number;
  price: number | null;
}

interface LosMatrixProps {
  seasonId: string | null;
  seasons: Array<{ id: string; name: string }>;
}

const MAX_DAYS = 30;
const DEFAULT_RATE_PLAN = 'default';

type Channel = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  is_active: boolean;
};

export default function LosMatrix({ seasonId, seasons }: LosMatrixProps) {
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(seasonId);
  const [ratePlanId, setRatePlanId] = useState<string>(DEFAULT_RATE_PLAN);
  const [channel, setChannel] = useState<string>('all');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [rows, setRows] = useState<LosRow[]>([]);
  const [extraDayPrice, setExtraDayPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copySourceSeasonId, setCopySourceSeasonId] = useState<string>('');

  // Load channels from database
  useEffect(() => {
    const loadChannels = async () => {
      try {
        const response = await fetch('/api/admin/channels', { credentials: 'include' });
        const result = await response.json();

        if (result.error) {
          console.error('Error loading channels:', result.error);
          // Fallback to default channels if API fails
          return;
        }

        const activeChannels = (result.channels || []).filter((ch: Channel) => ch.is_active);
        
        // Safety net: if no channels found, offer to seed defaults
        if (activeChannels.length === 0) {
          setChannels([]);
          return;
        }

        setChannels(activeChannels);

        // Set default channel to 'all' if available, otherwise first channel
        if (activeChannels.length > 0) {
          const allChannel = activeChannels.find((ch: Channel) => ch.code === 'all');
          if (allChannel) {
            setChannel('all');
          } else {
            setChannel(activeChannels[0].code);
          }
        }
      } catch (error) {
        console.error('Error loading channels:', error);
      }
    };

    loadChannels();
  }, []);

  // Initialize rows
  useEffect(() => {
    const initialRows: LosRow[] = [];
    for (let i = 1; i <= MAX_DAYS; i++) {
      initialRows.push({ days: i, price: null });
    }
    setRows(initialRows);
  }, []);

  // Load matrix when selection changes
  useEffect(() => {
    if (selectedSeasonId) {
      loadMatrix();
    }
  }, [selectedSeasonId, ratePlanId, channel]);

  // Sync with parent seasonId prop
  useEffect(() => {
    if (seasonId && seasonId !== selectedSeasonId) {
      setSelectedSeasonId(seasonId);
    }
  }, [seasonId]);

  const loadMatrix = async () => {
    if (!selectedSeasonId) return;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        season_id: selectedSeasonId,
        rate_plan_id: ratePlanId || '',
        channel: channel, // Send the channel code directly ('all', 'holidayextras', etc.)
      });

      const response = await fetch(`/api/admin/pricing/matrix?${params}`, {
        credentials: 'include',
      });
      const result = await response.json();

      if (result.error) {
        toast.error(result.error);
        return;
      }

      // Populate rows
      const newRows: LosRow[] = [];
      for (let i = 1; i <= MAX_DAYS; i++) {
        const rowData = result.rows?.find((r: any) => r.days === i);
        newRows.push({
          days: i,
          price: rowData?.price ?? null,
        });
      }
      setRows(newRows);
      setExtraDayPrice(result.extraDayPrice ?? null);
      setHasChanges(false);
    } catch (error) {
      console.error('Error loading matrix:', error);
      toast.error('Failed to load pricing matrix');
    } finally {
      setLoading(false);
    }
  };

  const updateRowPrice = (days: number, price: string) => {
    const numPrice = price === '' ? null : parseFloat(price);
    if (numPrice !== null && (isNaN(numPrice) || numPrice < 0)) {
      return; // Invalid input
    }

    setRows((prev) =>
      prev.map((r) => (r.days === days ? { ...r, price: numPrice } : r))
    );
    setHasChanges(true);
  };

  const updateExtraDayPrice = (price: string) => {
    const numPrice = price === '' ? null : parseFloat(price);
    if (numPrice !== null && (isNaN(numPrice) || numPrice < 0)) {
      return;
    }
    setExtraDayPrice(numPrice);
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!selectedSeasonId) {
      toast.error('Please select a season');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/admin/pricing/matrix', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          seasonId: selectedSeasonId,
          ratePlanId: ratePlanId || null,
          channel: channel, // Send the channel code directly ('all', 'holidayextras', etc.)
          maxDays: MAX_DAYS,
          rows: rows.filter((r) => r.price !== null),
          extraDayPrice,
        }),
      });

      const result = await response.json();
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast.success('Pricing matrix saved');
      setHasChanges(false);
    } catch (error) {
      console.error('Error saving matrix:', error);
      toast.error('Failed to save pricing matrix');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyFromSeason = () => {
    if (!selectedSeasonId) {
      toast.error('Please select a season first');
      return;
    }
    setCopyDialogOpen(true);
  };

  const executeCopyFromSeason = async () => {
    if (!copySourceSeasonId) {
      toast.error('Please select a season to copy from');
      return;
    }

    if (copySourceSeasonId === selectedSeasonId) {
      toast.error('Cannot copy from the same season');
      return;
    }

    try {
      const params = new URLSearchParams({
        season_id: copySourceSeasonId,
        rate_plan_id: ratePlanId || '',
        channel: channel, // Send the channel code directly ('all', 'holidayextras', etc.)
      });

      const response = await fetch(`/api/admin/pricing/matrix?${params}`, {
        credentials: 'include',
      });
      const result = await response.json();

      if (result.error) {
        toast.error(result.error);
        return;
      }

      // Copy rows
      const newRows: LosRow[] = [];
      for (let i = 1; i <= MAX_DAYS; i++) {
        const rowData = result.rows?.find((r: any) => r.days === i);
        newRows.push({
          days: i,
          price: rowData?.price ?? null,
        });
      }
      setRows(newRows);
      setExtraDayPrice(result.extraDayPrice ?? null);
      setHasChanges(true);
      setCopyDialogOpen(false);
      setCopySourceSeasonId('');
      toast.success('Copied pricing from season');
    } catch (error) {
      console.error('Error copying matrix:', error);
      toast.error('Failed to copy pricing matrix');
    }
  };

  const handlePercentageAdjustment = () => {
    const percentage = prompt('Enter percentage adjustment (e.g., 10 for +10%, -5 for -5%):');
    if (!percentage) return;

    const percent = parseFloat(percentage);
    if (isNaN(percent)) {
      toast.error('Invalid percentage');
      return;
    }

    const multiplier = 1 + percent / 100;
    setRows((prev) =>
      prev.map((r) => ({
        ...r,
        price: r.price !== null ? Math.round(r.price * multiplier * 100) / 100 : null,
      }))
    );
    if (extraDayPrice !== null) {
      setExtraDayPrice(Math.round(extraDayPrice * multiplier * 100) / 100);
    }
    setHasChanges(true);
    toast.success(`Applied ${percent > 0 ? '+' : ''}${percent}% adjustment`);
  };

  if (!selectedSeasonId) {
    return (
      <div className="h-full flex items-center justify-center text-gray-500">
        Select a season to view pricing matrix
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col relative">
      {/* Header Controls - Sticky */}
      <div className="sticky top-0 z-10 bg-white pb-4 space-y-3 border-b border-gray-200 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <Label>Season</Label>
            <Select
              value={selectedSeasonId}
              onValueChange={setSelectedSeasonId}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {seasons.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Rate Plan</Label>
            <Input
              value={ratePlanId}
              onChange={(e) => setRatePlanId(e.target.value)}
              placeholder="default"
            />
          </div>
          <div>
            <Label>Channel</Label>
            {channels.length === 0 ? (
              <div className="space-y-2">
                <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded p-3">
                  <p className="font-medium mb-1">No channels found for this tenant.</p>
                  <p className="text-xs mb-2">Click below to create default channels (all, direct, web, agent).</p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        const response = await fetch('/api/admin/channels/seed', {
                          method: 'POST',
                          credentials: 'include',
                        });
                        const result = await response.json();
                        if (result.error) {
                          toast.error(result.error);
                          return;
                        }
                        toast.success('Default channels created');
                        // Reload channels
                        const channelsResponse = await fetch('/api/admin/channels', { credentials: 'include' });
                        const channelsResult = await channelsResponse.json();
                        if (channelsResult.channels) {
                          const activeChannels = channelsResult.channels.filter((ch: Channel) => ch.is_active);
                          setChannels(activeChannels);
                          if (activeChannels.length > 0) {
                            const allChannel = activeChannels.find((ch: Channel) => ch.code === 'all');
                            setChannel(allChannel ? 'all' : activeChannels[0].code);
                          }
                        }
                      } catch (error) {
                        console.error('Error seeding channels:', error);
                        toast.error('Failed to create default channels');
                      }
                    }}
                  >
                    Create Default Channels
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <Select value={channel} onValueChange={setChannel}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {channels.map((ch) => (
                      <SelectItem key={ch.id} value={ch.code}>
                        {ch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">
                  {channels.find((ch) => ch.code === channel)?.description || ''}
                </p>
              </>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleCopyFromSeason}
            disabled={loading}
            className="flex-shrink-0"
          >
            <Copy className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Copy from Season</span>
            <span className="sm:hidden">Copy</span>
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handlePercentageAdjustment}
            disabled={loading}
            className="flex-shrink-0"
          >
            <Percent className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">Apply % Adjustment</span>
            <span className="sm:hidden">% Adjust</span>
          </Button>
          <div className="flex-1 min-w-0" />
          <Button
            onClick={handleSave}
            disabled={saving || loading || !hasChanges}
            className="flex-shrink-0"
          >
            <Save className="h-4 w-4 mr-1" />
            <span className="hidden sm:inline">{saving ? 'Saving...' : 'Save Changes'}</span>
            <span className="sm:hidden">{saving ? 'Saving...' : 'Save'}</span>
          </Button>
        </div>
      </div>

      {/* Matrix Table */}
      <div className="flex-1 overflow-auto border rounded-lg">
        <table className="w-full">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">
                Days
              </th>
              <th className="px-4 py-2 text-left text-sm font-medium text-gray-700 border-b">
                Price (£)
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.days} className="hover:bg-gray-50">
                <td className="px-4 py-2 text-sm font-medium text-gray-900 border-b">
                  {row.days}
                </td>
                <td className="px-4 py-2 border-b">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={row.price ?? ''}
                    onChange={(e) => updateRowPrice(row.days, e.target.value)}
                    placeholder="—"
                    className="w-32"
                  />
                </td>
              </tr>
            ))}
            {/* Extra day price row */}
            <tr className="bg-gray-50">
              <td className="px-4 py-2 text-sm font-medium text-gray-900 border-b">
                Extra day (after {MAX_DAYS} days)
              </td>
              <td className="px-4 py-2 border-b">
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={extraDayPrice ?? ''}
                  onChange={(e) => updateExtraDayPrice(e.target.value)}
                  placeholder="—"
                  className="w-32"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-500 mt-2">
        Prices are for the whole stay, not per day. Adjusted by season and length of stay.
      </p>

      {/* Copy from Season Dialog */}
      <Dialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
        <DialogContent className="bg-white text-gray-900">
          <DialogHeader>
            <DialogTitle>Copy Pricing from Season</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Select Season to Copy From</Label>
              <Select
                value={copySourceSeasonId}
                onValueChange={setCopySourceSeasonId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a season..." />
                </SelectTrigger>
                <SelectContent>
                  {seasons
                    .filter((s) => s.id !== selectedSeasonId)
                    .map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-2">
                This will copy all pricing data from the selected season to the current season.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={executeCopyFromSeason} disabled={!copySourceSeasonId}>
              Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

