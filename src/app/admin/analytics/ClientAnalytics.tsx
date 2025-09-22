'use client';

import * as React from 'react';
import AnalyticsFilters, { type Filters } from '@/components/analytics/AnalyticsFilters';
import DailyOccupancyStacked from '@/components/charts/DailyOccupancyStacked';

export default function ClientAnalytics({ tenantId, initial }: { tenantId: string; initial: Filters }) {
  const [filters, setFilters] = React.useState<Filters>(initial);

  return (
    <div className="space-y-4">
      <AnalyticsFilters initial={initial} onChange={setFilters} />
      <DailyOccupancyStacked
        tenantId={tenantId}
        start={filters.start}
        end={filters.end}
        tz={filters.tz}
        vehicle={filters.vehicle}
      />
    </div>
  );
}
