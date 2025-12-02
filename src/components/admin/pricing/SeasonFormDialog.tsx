'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, X } from 'lucide-react';
import type { SeasonWithRanges } from './SeasonList';

interface SeasonFormDialogProps {
  open: boolean;
  onClose: () => void;
  onSave: () => void;
  season: SeasonWithRanges | null; // null for create, Season for edit
}

export default function SeasonFormDialog({
  open,
  onClose,
  onSave,
  season,
}: SeasonFormDialogProps) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [color, setColor] = useState('#3b82f6');
  const [ranges, setRanges] = useState<Array<{ start: string; end: string }>>([
    { start: '', end: '' },
  ]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      if (season) {
        // Edit mode
        setName(season.name);
        setCode(season.code);
        setColor(season.color || '#3b82f6');
        // Convert ranges from [start, end) to { start, end } format
        // Note: end in daterange is exclusive, so we need to add 1 day back
        setRanges(
          season.ranges.length > 0
            ? season.ranges.map((r) => {
                const endDate = new Date(r.range[1]);
                endDate.setDate(endDate.getDate() - 1); // Convert exclusive end to inclusive
                return {
                  start: r.range[0],
                  end: endDate.toISOString().split('T')[0],
                };
              })
            : [{ start: '', end: '' }]
        );
      } else {
        // Create mode
        setName('');
        setCode('');
        setColor('#3b82f6');
        setRanges([{ start: '', end: '' }]);
      }
    }
  }, [open, season]);

  const addRange = () => {
    setRanges([...ranges, { start: '', end: '' }]);
  };

  const removeRange = (index: number) => {
    setRanges(ranges.filter((_, i) => i !== index));
  };

  const updateRange = (index: number, field: 'start' | 'end', value: string) => {
    const updated = [...ranges];
    updated[index] = { ...updated[index], [field]: value };
    setRanges(updated);
  };

  const handleSave = async () => {
    if (!name.trim() || !code.trim()) {
      alert('Name and code are required');
      return;
    }

    // Validate ranges
    const validRanges = ranges.filter((r) => r.start && r.end);
    if (validRanges.length === 0) {
      alert('At least one date range is required');
      return;
    }

    // Validate date ranges
    for (const range of validRanges) {
      const start = new Date(range.start);
      const end = new Date(range.end);
      if (start >= end) {
        alert('End date must be after start date');
        return;
      }
    }

    setSaving(true);
    try {
      if (season) {
        // Update existing season
        const seasonResponse = await fetch(`/api/pricing/seasons/${season.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name,
            code,
            color,
          }),
        });

        const seasonResult = await seasonResponse.json();
        if (seasonResult.error) {
          alert(`Error updating season: ${seasonResult.error}`);
          setSaving(false);
          return;
        }

        // Delete existing ranges
        for (const range of season.ranges) {
          await fetch(`/api/pricing/seasons/${season.id}/ranges/${range.id}`, {
            method: 'DELETE',
            credentials: 'include',
          });
        }

        // Add new ranges
        for (const range of validRanges) {
          const endDate = new Date(range.end);
          endDate.setDate(endDate.getDate() + 1); // Convert to exclusive end for daterange
          const rangeResponse = await fetch(
            `/api/pricing/seasons/${season.id}/ranges`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                start: range.start,
                end: endDate.toISOString().split('T')[0],
              }),
            }
          );
          const rangeResult = await rangeResponse.json();
          if (rangeResult.error) {
            console.error('Error adding range:', rangeResult.error);
          }
        }
      } else {
        // Create new season
        const seasonResponse = await fetch('/api/pricing/seasons', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            name,
            code,
            color,
          }),
        });

        const seasonResult = await seasonResponse.json();
        if (seasonResult.error) {
          alert(`Error creating season: ${seasonResult.error}`);
          setSaving(false);
          return;
        }

        const newSeasonId = seasonResult.data.id;

        // Add ranges
        for (const range of validRanges) {
          const endDate = new Date(range.end);
          endDate.setDate(endDate.getDate() + 1); // Convert to exclusive end for daterange
          const rangeResponse = await fetch(
            `/api/pricing/seasons/${newSeasonId}/ranges`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              credentials: 'include',
              body: JSON.stringify({
                start: range.start,
                end: endDate.toISOString().split('T')[0],
              }),
            }
          );
          const rangeResult = await rangeResponse.json();
          if (rangeResult.error) {
            console.error('Error adding range:', rangeResult.error);
          }
        }
      }

      onSave();
      onClose();
    } catch (error) {
      console.error('Error saving season:', error);
      alert('Failed to save season');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-white text-gray-900">
        <DialogHeader>
          <DialogTitle>{season ? 'Edit Season' : 'Create Season'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Winter 25/26"
              />
            </div>
            <div>
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. WINTER_25_26"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="color">Color</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                id="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-10 w-20 rounded border"
              />
              <Input
                value={color}
                onChange={(e) => setColor(e.target.value)}
                placeholder="#3b82f6"
                className="flex-1"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Date Ranges</Label>
              <Button type="button" variant="outline" size="sm" onClick={addRange}>
                <Plus className="h-4 w-4 mr-1" />
                Add Range
              </Button>
            </div>
            <div className="space-y-2">
              {ranges.map((range, index) => (
                <div key={index} className="flex items-center gap-2">
                  <Input
                    type="date"
                    value={range.start}
                    onChange={(e) => updateRange(index, 'start', e.target.value)}
                    placeholder="Start date"
                    className="flex-1"
                  />
                  <Input
                    type="date"
                    value={range.end}
                    onChange={(e) => updateRange(index, 'end', e.target.value)}
                    placeholder="End date"
                    className="flex-1"
                  />
                  {ranges.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeRange(index)}
                      className="h-10 w-10 p-0"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Add one or more date ranges for this season. Dates are inclusive.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : season ? 'Update' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

