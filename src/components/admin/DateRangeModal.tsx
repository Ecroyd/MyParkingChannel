'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

interface DateRangeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDateRangeChange: (dateRange: { from: string; to: string }) => void;
  title?: string;
}

export default function DateRangeModal({ 
  isOpen, 
  onClose, 
  onDateRangeChange, 
  title = "Select Date Range" 
}: DateRangeModalProps) {
  const [selectedRange, setSelectedRange] = useState('today');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  const handleRangeChange = (range: string) => {
    setSelectedRange(range);
    setShowCustom(false);
    
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    
    let from: string;
    let to: string;
    
    switch (range) {
      case 'today':
        from = todayStr;
        to = todayStr;
        break;
      case 'tomorrow':
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        from = tomorrow.toISOString().split('T')[0];
        to = tomorrow.toISOString().split('T')[0];
        break;
      case 'next7days':
        const nextWeek = new Date(today);
        nextWeek.setDate(today.getDate() + 7);
        from = todayStr;
        to = nextWeek.toISOString().split('T')[0];
        break;
      case 'next14days':
        const nextTwoWeeks = new Date(today);
        nextTwoWeeks.setDate(today.getDate() + 14);
        from = todayStr;
        to = nextTwoWeeks.toISOString().split('T')[0];
        break;
      case 'next30days':
        const nextMonth = new Date(today);
        nextMonth.setDate(today.getDate() + 30);
        from = todayStr;
        to = nextMonth.toISOString().split('T')[0];
        break;
      case 'custom':
        setShowCustom(true);
        return;
      default:
        from = todayStr;
        to = todayStr;
    }
    
    onDateRangeChange({ from, to });
    onClose();
  };

  const handleCustomDateSubmit = () => {
    if (customStartDate && customEndDate) {
      onDateRangeChange({ from: customStartDate, to: customEndDate });
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Preset Options */}
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              onClick={() => handleRangeChange('today')}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Today
            </button>
            <button
              onClick={() => handleRangeChange('tomorrow')}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Tomorrow
            </button>
            <button
              onClick={() => handleRangeChange('next7days')}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Next 7 Days
            </button>
            <button
              onClick={() => handleRangeChange('next14days')}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Next 14 Days
            </button>
            <button
              onClick={() => handleRangeChange('next30days')}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Next 30 Days
            </button>
            <button
              onClick={() => handleRangeChange('custom')}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
            >
              Custom Range
            </button>
          </div>

          {/* Custom Date Range */}
          {showCustom && (
            <div className="p-4 bg-gray-50 rounded-lg">
              <h4 className="text-sm font-medium text-gray-900 mb-3">Select Custom Date Range</h4>
              <div className="space-y-4">
                <div>
                  <label htmlFor="modal-start-date" className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date
                  </label>
                  <input
                    id="modal-start-date"
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label htmlFor="modal-end-date" className="block text-sm font-medium text-gray-700 mb-1">
                    End Date
                  </label>
                  <input
                    id="modal-end-date"
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="flex justify-end">
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
      </div>
    </div>
  );
}
