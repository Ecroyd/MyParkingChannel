'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { format } from 'date-fns';
import SeasonFormDialog from './SeasonFormDialog';

export type Season = {
  id: string;
  code: string;
  name: string;
  color?: string | null;
};

export type SeasonRange = {
  id: string;
  range: [string, string]; // [start, end) as strings
};

export type SeasonWithRanges = Season & {
  ranges: SeasonRange[];
};

interface SeasonListProps {
  selectedSeasonId: string | null;
  onSelectSeason: (seasonId: string) => void;
  onSeasonChange: () => void; // Called when seasons are created/updated/deleted
  onSeasonsLoaded?: (seasons: Array<{ id: string; name: string }>) => void; // Callback to pass seasons to parent
}

export default function SeasonList({
  selectedSeasonId,
  onSelectSeason,
  onSeasonChange,
  onSeasonsLoaded,
}: SeasonListProps) {
  const [seasons, setSeasons] = useState<SeasonWithRanges[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editingSeason, setEditingSeason] = useState<SeasonWithRanges | null>(null);

  const loadSeasons = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/pricing/seasons', { credentials: 'include' });
      const result = await response.json();
      
      if (result.error) {
        console.error('Error loading seasons:', result.error);
        return;
      }

      const seasonsData: Season[] = result.data || [];
      
      // Load ranges for each season
      const seasonsWithRanges: SeasonWithRanges[] = await Promise.all(
        seasonsData.map(async (season) => {
          const rangesResponse = await fetch(
            `/api/pricing/seasons/${season.id}/ranges`,
            { credentials: 'include' }
          );
          const rangesResult = await rangesResponse.json();
          return {
            ...season,
            ranges: rangesResult.data || [],
          };
        })
      );

      setSeasons(seasonsWithRanges);
      
      // Notify parent of loaded seasons
      if (onSeasonsLoaded) {
        onSeasonsLoaded(seasonsWithRanges.map(s => ({ id: s.id, name: s.name })));
      }
      
      // Auto-select first season if none selected
      if (!selectedSeasonId && seasonsWithRanges.length > 0) {
        onSelectSeason(seasonsWithRanges[0].id);
      }
    } catch (error) {
      console.error('Error loading seasons:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSeasons();
  }, []);

  const handleCreate = () => {
    setEditingSeason(null);
    setFormOpen(true);
  };

  const handleEdit = (season: SeasonWithRanges) => {
    setEditingSeason(season);
    setFormOpen(true);
  };

  const handleDelete = async (season: SeasonWithRanges) => {
    // Check if season has pricing rules
    const checkResponse = await fetch(
      `/api/pricing/rules?season_id=${season.id}`,
      { credentials: 'include' }
    );
    const checkResult = await checkResponse.json();
    
    if (checkResult.data && checkResult.data.length > 0) {
      alert(
        `Cannot delete season "${season.name}": It still has ${checkResult.data.length} pricing rule(s). Please remove pricing rules first.`
      );
      return;
    }

    if (!confirm(`Are you sure you want to delete "${season.name}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/pricing/seasons/${season.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const result = await response.json();

      if (result.error) {
        alert(`Error: ${result.error}`);
        return;
      }

      await loadSeasons();
      onSeasonChange();
      
      // If deleted season was selected, select first available
      if (selectedSeasonId === season.id) {
        const remaining = seasons.filter((s) => s.id !== season.id);
        if (remaining.length > 0) {
          onSelectSeason(remaining[0].id);
        }
      }
    } catch (error) {
      console.error('Error deleting season:', error);
      alert('Failed to delete season');
    }
  };

  const handleFormSave = async () => {
    setFormOpen(false);
    await loadSeasons();
    onSeasonChange();
  };

  const formatDateRange = (range: [string, string]) => {
    try {
      const start = new Date(range[0]);
      const end = new Date(range[1]);
      // Subtract 1 day from end since it's exclusive in daterange
      end.setDate(end.getDate() - 1);
      return `${format(start, 'd MMM yyyy')} – ${format(end, 'd MMM yyyy')}`;
    } catch {
      return `${range[0]} – ${range[1]}`;
    }
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-sm text-gray-500">Loading seasons...</div>
      </div>
    );
  }

  return (
    <>
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Seasons</h2>
          <Button onClick={handleCreate} size="sm">
            <Plus className="h-4 w-4 mr-1" />
            Add Season
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3">
          {seasons.length === 0 ? (
            <div className="text-sm text-gray-500 text-center py-8">
              No seasons yet. Create one to get started.
            </div>
          ) : (
            seasons.map((season) => (
              <div
                key={season.id}
                className={`rounded-lg border p-4 cursor-pointer transition-colors ${
                  selectedSeasonId === season.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 bg-white hover:border-gray-300'
                }`}
                onClick={() => onSelectSeason(season.id)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 flex-1">
                    <div
                      className="w-4 h-4 rounded-full flex-shrink-0"
                      style={{ backgroundColor: season.color || '#3b82f6' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{season.name}</div>
                      <div className="text-xs text-gray-500 font-mono mt-0.5">
                        {season.code}
                      </div>
                      {season.ranges.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {season.ranges.map((range) => (
                            <span
                              key={range.id}
                              className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-700"
                            >
                              {formatDateRange(range.range)}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-1 ml-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEdit(season)}
                      className="h-7 w-7 p-0"
                    >
                      <Edit className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(season)}
                      className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <SeasonFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSave={handleFormSave}
        season={editingSeason}
      />
    </>
  );
}

