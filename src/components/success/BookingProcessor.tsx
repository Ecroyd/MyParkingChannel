"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface BookingProcessorProps {
  tenantId: string;
  reference: string;
}

export default function BookingProcessor({ tenantId, reference }: BookingProcessorProps) {
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const router = useRouter();

  const tryCreateBooking = async () => {
    if (isCreating) return;
    
    setIsCreating(true);
    try {
      // Get the stored booking data first
      const tempDataResponse = await fetch(`/api/bookings/temp-store?tenantId=${tenantId}&reference=${reference}`);
      if (tempDataResponse.ok) {
        const tempData = await tempDataResponse.json();
        const storedData = tempData.data;
        
        if (storedData) {
          // Use the stored data to create the booking
          const response = await fetch('/api/bookings/create-from-payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              tenantId,
              reference,
              customerName: storedData.customerName || 'Customer',
              customerEmail: storedData.customerEmail || 'customer@example.com',
              customerPhone: storedData.customerPhone || '',
              plate: storedData.plate || 'UNKNOWN',
              flightNumber: storedData.flightNumber || null,
              startAt: storedData.startAt || new Date().toISOString(),
              endAt: storedData.endAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
              amount: storedData.amount || 0
            })
          });

          if (response.ok) {
            router.refresh();
            return;
          }
        }
      }
      
      // If no stored data, just refresh and let the webhook handle it
      router.refresh();
    } catch (error) {
      console.error('Failed to create booking manually:', error);
      router.refresh();
    } finally {
      setIsCreating(false);
    }
  };

  useEffect(() => {
    const maxAttempts = 3; // Try for 3 seconds
    const interval = 1000; // Check every second

    if (attempts >= maxAttempts) {
      // After 3 attempts, try to create the booking manually
      if (attempts === maxAttempts) {
        tryCreateBooking();
      } else {
        setError('Booking is taking longer than expected. Please contact support if this continues.');
      }
      return;
    }

    const timer = setTimeout(() => {
      setAttempts(prev => prev + 1);
      // Refresh the page to check for the booking
      router.refresh();
    }, interval);

    return () => clearTimeout(timer);
  }, [attempts, router]);

  if (error) {
    return (
      <main className="mx-auto max-w-xl p-6">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold mb-2 text-red-600">Booking Processing Issue</h1>
          <p className="text-sm text-gray-600 mb-4">{error}</p>
          <p className="text-xs text-gray-500">
            Reference: {reference}<br/>
            If you completed payment, your booking should still be processed.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl p-6">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <h1 className="text-2xl font-semibold mb-2">Processing</h1>
        <p className="text-sm text-gray-600">
          Please wait while we confirm your payment and create your booking.
        </p>
      </div>
    </main>
  );
}
