'use client';

import * as React from 'react';
import DailyOccupancyStackedServer from '@/components/charts/DailyOccupancyStackedServer';

interface AnalyticsServerClientProps {
  user: any;
  tenant: any;
  chartData: Array<{
    date: string;
    in: number;
    out: number;
    capacity: number;
  }>;
}

export default function AnalyticsServerClient({ user, tenant, chartData }: AnalyticsServerClientProps) {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Analytics</h1>
          <p className="text-gray-600">Performance insights for {tenant?.name}</p>
        </div>
        <div className="text-sm text-gray-500">
          {tenant?.name} • {tenant?.slug}
        </div>
      </div>

      {/* Chart */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Daily Occupancy Analysis</h3>
        <DailyOccupancyStackedServer data={chartData} />
      </div>

      {/* Additional analytics can be added here */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Total Bookings</h3>
          <p className="text-3xl font-bold text-blue-600">
            {chartData.reduce((sum, day) => sum + day.in, 0)}
          </p>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Average Daily</h3>
          <p className="text-3xl font-bold text-green-600">
            {Math.round(chartData.reduce((sum, day) => sum + day.in, 0) / chartData.length)}
          </p>
        </div>
        
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-medium text-gray-900 mb-2">Peak Day</h3>
          <p className="text-3xl font-bold text-purple-600">
            {Math.max(...chartData.map(day => day.in))}
          </p>
        </div>
      </div>
    </div>
  );
}
