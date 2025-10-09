// components/payments/PaymentButtons.tsx
'use client';

interface PaymentButtonsProps {
  bookingId: string;
  onPaymentSuccess?: () => void;
  onExtensionSuccess?: () => void;
}

export function TakePaymentButton({ bookingId, onPaymentSuccess }: PaymentButtonsProps) {
  const handleTakePayment = async () => {
    try {
      const res = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          booking_id: bookingId, 
          application_fee_cents: 123 // Platform fee in pence
        }),
      });
      const json = await res.json();
      if (json.url) {
        window.location.href = json.url;
      } else if (json.error) {
        alert(`Payment error: ${json.error}`);
      }
    } catch (error) {
      alert('Failed to create payment session');
    }
  };

  return (
    <button
      className="rounded bg-black text-white px-3 py-2 text-sm"
      onClick={handleTakePayment}
    >
      Take Payment
    </button>
  );
}

export function PayExtensionButton({ 
  bookingId, 
  newEndAt, 
  quoteAmountCents, 
  onExtensionSuccess 
}: PaymentButtonsProps & { 
  newEndAt: string; 
  quoteAmountCents: number; 
}) {
  const handlePayExtension = async () => {
    try {
      const res = await fetch('/api/payments/booking-extension', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          booking_id: bookingId,
          new_end_at: newEndAt,
          quote_amount_cents: quoteAmountCents,
          application_fee_cents: 123, // Platform fee in pence
        }),
      });
      const json = await res.json();
      if (json.url) {
        window.location.href = json.url;
      } else if (json.error) {
        alert(`Extension payment error: ${json.error}`);
      }
    } catch (error) {
      alert('Failed to create extension payment session');
    }
  };

  return (
    <button
      className="rounded border px-3 py-2 text-sm"
      onClick={handlePayExtension}
    >
      Pay Extension
    </button>
  );
}

// Example usage in your booking components:
export function BookingPaymentActions({ booking }: { booking: any }) {
  return (
    <div className="flex gap-2">
      <TakePaymentButton 
        bookingId={booking.id} 
        onPaymentSuccess={() => window.location.reload()} 
      />
      {/* Add extension button when needed */}
    </div>
  );
}
