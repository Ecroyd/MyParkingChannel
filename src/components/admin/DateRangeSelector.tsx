'use client';

import { useState, useEffect } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import { tenantTodayDateKey } from '@/lib/timezone';

interface DateRangeSelectorProps {
  onDateRangeChange: (dateRange: { from: string; to: string }) => void;
  /** Tenant IANA timezone for calendar-day presets. */
  tenantTimezone?: string;
  /** When set, skips the automatic fetch on mount (SSR already loaded this range). */
  skipInitialFetch?: boolean;
  /** Initial preset when SSR provided a range (keeps selector in sync). */
  initialFrom?: string;
  initialTo?: string;
}

function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export default function DateRangeSelector({
  onDateRangeChange,
  tenantTimezone = 'Europe/London',
  skipInitialFetch = false,
  initialFrom,
  initialTo,
}: DateRangeSelectorProps) {
  const [selectedRange, setSelectedRange] = useState('today');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [showCustom, setShowCustom] = useState(false);
  const [isOpen, setIsOpen] = useState(false);

  const tenantToday = tenantTodayDateKey(tenantTimezone);

  useEffect(() => {
    if (initialFrom && initialTo) {
      if (initialFrom === tenantToday && initialTo === tenantToday) {
        setSelectedRange('today');
      }
    }
  }, [initialFrom, initialTo, tenantToday]);

  useEffect(() => {
    if (skipInitialFetch) return;
    onDateRangeChange({ from: tenantToday, to: tenantToday });
  }, [skipInitialFetch, onDateRangeChange, tenantToday]);

  const handleRangeChange = (range: string) => {
    setSelectedRange(range);
    setShowCustom(false);

    const todayStr = tenantToday;

    let from: string;
    let to: string;

    switch (range) {
      case 'today':
        from = todayStr;
        to = todayStr;
        break;
      case 'tomorrow':
        from = addDays(todayStr, 1);
        to = addDays(todayStr, 1);
        break;
      case 'next7days':
        from = todayStr;
        to = addDays(todayStr, 7);
        break;
      case 'next14days':
        from = todayStr;
        to = addDays(todayStr, 14);
        break;
      case 'next30days':
        from = todayStr;
        to = addDays(todayStr, 30);
        break;
      case 'custom':
        setShowCustom(true);
        return;
      default:
        from = todayStr;
        to = todayStr;
    }

    onDateRangeChange({ from, to });
  };

  const handleCustomDateSubmit = () => {
    if (customStartDate && customEndDate) {
      onDateRangeChange({ from: customStartDate, to: customEndDate });
    }
  };

  const getDisplayText = () => {
    switch (selectedRange) {
      case 'today': return 'Today';
      case 'tomorrow': return 'Tomorrow';
      case 'next7days': return 'Next 7 Days';
      case 'next14days': return 'Next 14 Days';
      case 'next30days': return 'Next 30 Days';
      case 'custom': return 'Custom Range';
      default: return 'Today';
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between w-full px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
      >
        <span>{getDisplayText()}</span>
        <ChevronDownIcon className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg">
          <div className="py-1">
            <button
              onClick={() => {
                handleRangeChange('today');
                setIsOpen(false);
              }}
              className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              Today
            </button>
            <button
              onClick={() => {
                handleRangeChange('tomorrow');
                setIsOpen(false);
              }}
              className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              Tomorrow
            </button>
            <button
              onClick={() => {
                handleRangeChange('next7days');
                setIsOpen(false);
              }}
              className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              Next 7 Days
            </button>
            <button
              onClick={() => {
                handleRangeChange('next14days');
                setIsOpen(false);
              }}
              className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              Next 14 Days
            </button>
            <button
              onClick={() => {
                handleRangeChange('next30days');
                setIsOpen(false);
              }}
              className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              Next 30 Days
            </button>
            <button
              onClick={() => {
                handleRangeChange('custom');
                setIsOpen(false);
              }}
              className="block w-full px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100"
            >
              Custom Range
            </button>
          </div>
        </div>
      )}

      {showCustom && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <h4 className="text-sm font-medium text-gray-900 mb-3">Select Custom Date Range</h4>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <label htmlFor="start-date" className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                id="start-date"
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex-1">
              <label htmlFor="end-date" className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                id="end-date"
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={handleCustomDateSubmit}
                disabled={!customStartDate || !customEndDate}
                className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
