'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface PollForSessionProps {
  sessionId: string;
}

/** Polls by-checkout-session until the webhook has created the booking, then refreshes the page. */
export default function PollForSession({ sessionId }: PollForSessionProps) {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(async () => {
      const res = await fetch(`/api/bookings/by-checkout-session?session_id=${encodeURIComponent(sessionId)}`);
      if (res.ok) {
        router.refresh();
      }
    }, 1500);
    return () => clearInterval(interval);
  }, [sessionId, router]);

  return (
    <main className="mx-auto max-w-xl p-6">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4" />
        <h1 className="text-2xl font-semibold mb-2">Confirming your payment</h1>
        <p className="text-sm text-gray-600">
          Please wait while we confirm your booking. This usually takes a few seconds.
        </p>
      </div>
    </main>
  );
}
