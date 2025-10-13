'use client';

import { useState } from 'react';

export function useDateRangeModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentDateRange, setCurrentDateRange] = useState<{ from: string; to: string } | null>(null);

  const openModal = () => setIsOpen(true);
  const closeModal = () => setIsOpen(false);

  const handleDateRangeChange = (dateRange: { from: string; to: string }) => {
    setCurrentDateRange(dateRange);
  };

  return {
    isOpen,
    currentDateRange,
    openModal,
    closeModal,
    handleDateRangeChange
  };
}
