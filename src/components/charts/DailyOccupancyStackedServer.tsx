// src/components/charts/DailyOccupancyStackedServer.tsx
'use client';

import React from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface DailyOccupancyStackedServerProps {
  data: Array<{
    date: string;
    in: number;
    out: number;
    capacity: number;
  }>;
  loading?: boolean;
  error?: string | null;
}

export default function DailyOccupancyStackedServer({ data, loading, error }: DailyOccupancyStackedServerProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-600">
        <p>Error loading data: {error}</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <p>No data available</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis 
          dataKey="date" 
          tick={{ fontSize: 12 }}
          tickFormatter={(value) => {
            const date = new Date(value);
            return date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
          }}
        />
        <YAxis tick={{ fontSize: 12 }} />
        <Tooltip 
          labelFormatter={(value) => {
            const date = new Date(value);
            return date.toLocaleDateString('en-GB', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            });
          }}
          formatter={(value, name) => [
            value, 
            name === 'in' ? 'Check-ins' : name === 'out' ? 'Check-outs' : 'Capacity'
          ]}
        />
        <Area
          type="monotone"
          dataKey="in"
          stackId="1"
          stroke="#10b981"
          fill="#10b981"
          fillOpacity={0.6}
        />
        <Area
          type="monotone"
          dataKey="out"
          stackId="1"
          stroke="#ef4444"
          fill="#ef4444"
          fillOpacity={0.6}
        />
        <Area
          type="monotone"
          dataKey="capacity"
          stackId="2"
          stroke="#6b7280"
          fill="#6b7280"
          fillOpacity={0.3}
          strokeDasharray="5 5"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
