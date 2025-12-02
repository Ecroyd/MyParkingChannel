'use client';

import { useState } from 'react';
import SeasonList from '@/components/admin/pricing/SeasonList';
import LosMatrix from '@/components/admin/pricing/LosMatrix';

export default function AdminPricing() {
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [seasons, setSeasons] = useState<Array<{ id: string; name: string }>>([]);

  const handleSeasonChange = () => {
    // Reload seasons list - this will be called when seasons are created/updated/deleted
    // The SeasonList component will handle the reload internally
  };

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[hsl(210,16%,98%)] p-6">
      <div className="mx-auto max-w-7xl h-[calc(100vh-120px)]">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Pricing</h1>
          <p className="text-sm text-black/60">
            Manage seasons and length-of-stay pricing matrices.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[calc(100%-80px)]">
          {/* Left Pane: Seasons */}
          <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-5">
            <SeasonList
              selectedSeasonId={selectedSeasonId}
              onSelectSeason={setSelectedSeasonId}
              onSeasonChange={handleSeasonChange}
              onSeasonsLoaded={setSeasons}
            />
          </div>

          {/* Right Pane: LOS Matrix */}
          <div className="bg-white rounded-2xl shadow-sm border border-black/5 p-5">
            <LosMatrix seasonId={selectedSeasonId} seasons={seasons} />
          </div>
        </div>
      </div>
    </div>
  );
}
