'use client';

import { useState } from 'react';

interface DateRange {
  from: string;
  to: string;
}

interface DateRangeSelectorProps {
  onDateRangeChange: (dateRange: DateRange) => void;
  initialRange?: string;
}

export default function DateRangeSelector({ 
  onDateRangeChange, 
  initialRange = 'today' 
}: DateRangeSelectorProps) {
  const [dateRange, setDateRange] = useState(initialRange);
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Calculate date range
  const getDateRange = () => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    let result;
    switch (dateRange) {
      case 'today':
        result = { from: todayStr, to: todayStr };
        break;
      case 'tomorrow':
        const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);
        const tomorrowStr = tomorrow.toISOString().split('T')[0];
        result = { from: tomorrowStr, to: tomorrowStr };
        break;
      case 'next7days':
        const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
        result = { from: todayStr, to: nextWeek.toISOString().split('T')[0] };
        break;
      case 'next14days':
        const nextTwoWeeks = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);
        result = { from: todayStr, to: nextTwoWeeks.toISOString().split('T')[0] };
        break;
      case 'next30days':
        const nextMonth = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
        result = { from: todayStr, to: nextMonth.toISOString().split('T')[0] };
        break;
      case 'next90days':
        const nextQuarter = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
        result = { from: todayStr, to: nextQuarter.toISOString().split('T')[0] };
        break;
      case 'custom':
        if (customStartDate && customEndDate) {
          result = { from: customStartDate, to: customEndDate };
        } else {
          result = { from: todayStr, to: todayStr };
        }
        break;
      default:
        result = { from: todayStr, to: todayStr };
    }
    
    return result;
  };

  const handleDateRangeChange = (newRange: string) => {
    setDateRange(newRange);
    
    // If switching to custom, don't trigger change yet
    if (newRange === 'custom') {
      return;
    }
    
    const range = getDateRange();
    onDateRangeChange(range);
  };

  const handleCustomDateChange = () => {
    if (customStartDate && customEndDate) {
      const range = { from: customStartDate, to: customEndDate };
      onDateRangeChange(range);
    }
  };

  return (
    <div className="mb-4 flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-2">
        <label htmlFor="dateRange" className="text-sm font-medium text-gray-700">
          Date Range:
        </label>
        <select
          id="dateRange"
          value={dateRange}
          onChange={(e) => handleDateRangeChange(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="today">Today</option>
          <option value="tomorrow">Tomorrow</option>
          <option value="next7days">Next 7 Days</option>
          <option value="next14days">Next 14 Days</option>
          <option value="next30days">Next 30 Days</option>
          <option value="next90days">Next 90 Days</option>
          <option value="custom">Custom Range</option>
        </select>
      </div>
      
      {dateRange === 'custom' && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={customStartDate}
            onChange={(e) => setCustomStartDate(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="Start date"
          />
          <span className="text-sm text-gray-500">to</span>
          <input
            type="date"
            value={customEndDate}
            onChange={(e) => setCustomEndDate(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder="End date"
          />
          <button
            onClick={handleCustomDateChange}
            className="px-3 py-1 bg-blue-500 text-white text-sm rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
